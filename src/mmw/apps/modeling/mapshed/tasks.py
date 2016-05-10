# -*- coding: utf-8 -*-
from __future__ import print_function
from __future__ import unicode_literals
from __future__ import absolute_import

import numpy as np

from os.path import join, dirname, abspath
from ast import literal_eval as make_tuple

from celery import shared_task
from celery.exceptions import Retry

from gwlfe import gwlfe, parser
from gwlfe.datamodel import DataModel

from django.conf import settings
from django.contrib.gis.geos import GEOSGeometry

from apps.modeling.geoprocessing import sjs_submit, sjs_retrieve
from apps.modeling.mapshed.calcs import (day_lengths,
                                         nearest_weather_stations,
                                         growing_season,
                                         erosion_coeff,
                                         et_adjustment,
                                         animal_energy_units,
                                         manure_spread,
                                         streams,
                                         stream_length,
                                         point_source_discharge,
                                         weather_data,
                                         curve_number,
                                         sediment_phosphorus,
                                         )

AG_NLCD_CODES = settings.GWLFE_CONFIG['AgriculturalNLCDCodes']
ACRES_PER_SQM = 0.000247105


@shared_task
def mapshed_start(opname, input_data):
    host = settings.GEOP['host']
    port = settings.GEOP['port']
    args = settings.GEOP['args']['MapshedJob']

    data = settings.GEOP['json'][opname].copy()
    data['input'].update(input_data)

    try:
        job_id = sjs_submit(host, port, args, data)

        return {
            'host': host,
            'port': port,
            'job_id': job_id
        }

    except Exception as x:
        return {
            'error': x.message
        }


@shared_task(bind=True, default_retry_delay=1, max_retries=42)
def mapshed_finish(self, incoming):
    if 'error' in incoming:
        return incoming

    try:
        return sjs_retrieve(retry=self.retry, **incoming)

    except Retry as r:
        # Celery throws a Retry exception when self.retry is called to stop
        # the execution of any further code, and to indicate to the worker
        # that the same task is going to be retried.
        # We capture and re-raise Retry to continue this behavior, and ensure
        # that it doesn't get passed to the next task like every other error.
        raise r
    except Exception as x:
        return {
            'error': x.message
        }


@shared_task
def collect_data(geop_result, geojson):
    geom = GEOSGeometry(geojson, srid=4326)
    area = geom.transform(5070, clone=True).area  # Square Meters

    # Data Model is called z by convention
    z = DataModel(settings.GWLFE_DEFAULTS)

    # Statically calculated lookup values
    z.DayHrs = day_lengths(geom)

    # Data from the Weather Stations dataset
    ws = nearest_weather_stations(geom)
    z.Grow = growing_season(ws)
    z.Acoef = erosion_coeff(ws, z.Grow)
    z.PcntET = et_adjustment(ws)
    z.WxYrBeg = max([w.begyear for w in ws])
    z.WxYrEnd = min([w.endyear for w in ws])
    z.WxYrs = z.WxYrEnd - z.WxYrBeg + 1

    # Data from the County Animals dataset
    livestock_aeu, poultry_aeu = animal_energy_units(geom)
    z.AEU = livestock_aeu / (area * ACRES_PER_SQM)
    z.n41j = livestock_aeu
    z.n41k = poultry_aeu
    z.n41l = livestock_aeu + poultry_aeu

    z.ManNitr, z.ManPhos = manure_spread(z.AEU)

    # Data from Streams dataset
    z.StreamLength = stream_length(geom)      # Meters
    z.n42b = round(z.StreamLength / 1000, 1)  # Kilometers

    # Data from Point Source Discharge dataset
    n_load, p_load, discharge = point_source_discharge(geom, area)
    z.PointNitr = n_load
    z.PointPhos = p_load
    z.PointFlow = discharge

    # Data from National Weather dataset
    temps, prcps = weather_data(ws, z.WxYrBeg, z.WxYrEnd)
    z.Temp = temps
    z.Prec = prcps

    # Begin processing geop_result
    z.AgLength = geop_result['ag_stream_pct'] * z.StreamLength
    z.UrbLength = z.StreamLength - z.AgLength
    z.n42 = round(z.AgLength / 1000, 1)
    z.n46e = geop_result['med_high_urban_stream_pct'] * z.StreamLength / 1000
    z.n46f = geop_result['low_urban_stream_pct'] * z.StreamLength / 1000

    z.CN = np.array(geop_result['cn'])
    z.SedPhos = geop_result['sed_phos']

    # TODO pass real input to model instead of reading it from gms file
    gms_filename = join(dirname(abspath(__file__)), 'data/sample_input.gms')
    gms_file = open(gms_filename, 'r')
    z = parser.GmsReader(gms_file).read()

    # The frontend expects an object with runoff and quality as keys.
    response_json = {'runoff': gwlfe.run(z)}

    return response_json


@shared_task(throws=Exception)
def nlcd_streams(sjs_result):
    """
    From a dictionary mapping NLCD codes to the count of stream pixels on
    each, return a dictionary with keys 'ag_stream_pct', 'low_urban_stream_pct'
    and 'med_high_urban_stream_pct' which indicate the percent of streams in
    agricultural areas (namely NLCD 81 Pasture/Hay and 82 Cultivated Crops),
    low density urban areas (NLCD 22), and medium and high density urban areas
    (NLCD 23 and 24) respectively.

    In addition, we inspect the result to see if it includes an 'error' key.
    If so, it would indicate that a preceeding task has thrown an exception,
    and thus we throw an exception with that message.

    We throw the actual exception in this final task in the chain, rather than
    one of the preceeding ones, because when creating a chain the resulting
    AsyncResult points to the last task in the chain. If task in the middle of
    the chain fails, and the last task doesn't run, the AsyncResult is never
    marked as Ready. In the case of pure chains this can be addressed with a
    simple link_error, but in the case of chords the entire set of tasks in
    the chord's header needs to be Ready before the body can execute. Thus, if
    the final task never runs, Celery repeatedly calls chord_unlock infinitely
    causing overflows. By throwing the exception in the final task instead of
    an intermediate one, we ensure that the group is marked as Ready, and the
    chord is notified of the failure and suspends execution gracefully.

    Furthermore, this task is decorated with 'throws=Exception' so that the
    exception is logged as INFO, rather than ERROR. This is because we have
    already logged it as an ERROR the first time it was thrown up the chain,
    and this will reduce noise in the logs.

    This task should be used as a template for making other geoprocessing
    post-processing tasks, to be used in geop_tasks.
    """
    if 'error' in sjs_result:
        raise Exception('[nlcd_streams] {}'.format(sjs_result['error']))

    # Parse SJS results
    # This can't be done in mapshed_finish because the keys may be tuples,
    # which are not JSON serializable and thus can't be shared between tasks
    result = parse_sjs_result(sjs_result)

    ag_count = sum(result.get(nlcd, 0) for nlcd in AG_NLCD_CODES)
    low_urban_count = result.get(22, 0)
    med_high_urban_count = sum(result.get(nlcd, 0) for nlcd in [23, 24])
    total = sum(result.values())

    ag, low, med_high = (float(count) / total
                         if total > 0 else 0
                         for count in (ag_count,
                                       low_urban_count,
                                       med_high_urban_count))

    return {
        'ag_stream_pct': ag,
        'low_urban_stream_pct': low,
        'med_high_urban_stream_pct': med_high
    }


@shared_task(throws=Exception)
def nlcd_soils(sjs_result):
    """
    Results are expected to be in the format:
    {
      (NLCD ID, Soil Group ID, Soil Texture ID): Count,
    }

    We calculate a number of values relying on various combinations
    of these raster datasets.
    """
    if 'error' in sjs_result:
        raise Exception('[nlcd_soils] {}'.format(sjs_result['error']))

    ngt_count = parse_sjs_result(sjs_result)

    # Split combined counts into separate ones for processing
    # Reduce [(n, g, t): c] to
    n_count = {}   # [n: sum(c)]
    ng_count = {}  # [(n, g): sum(c)]
    nt_count = {}  # [(n, t): sum(c)]
    for (n, g, t), count in ngt_count.iteritems():
        n_count[n] = count + n_count.get(n, 0)
        nt_count[(n, t)] = count + nt_count.get((n, t), 0)

        # Map soil group values to usable subset
        g2 = settings.SOIL_GROUP[g]
        ng_count[(n, g2)] = count + ng_count.get((n, g2), 0)

    return {
        'cn': curve_number(n_count, ng_count),
        'sed_phos': sediment_phosphorus(nt_count),
    }


def geop_tasks(geom, errback):
    # List of tuples of (opname, data, callback) for each geop task
    definitions = [
        ('nlcd_streams',
         {'polygon': [geom.geojson], 'vector': streams(geom)},
         nlcd_streams),

        ('nlcd_soils', {'polygon': [geom.geojson]}, nlcd_soils),
    ]

    return [(mapshed_start.s(opname, data) |
             mapshed_finish.s() |
             callback.s().set(link_error=errback))
            for (opname, data, callback) in definitions]


@shared_task
def combine(geop_results):
    """
    Flattens the incoming results dictionaries into one
    which has all the keys of the components.

    This could be a part of collect_data, but we need
    a buffer in a chord as a workaround to
    https://github.com/celery/celery/issues/3191
    """
    return {k: v for r in geop_results for k, v in r.items()}


def parse_sjs_result(sjs_result):
    # Convert string "List(1,2,3)" into tuple (1,2,3) for each key
    return {make_tuple(key[4:]): val for key, val in sjs_result.items()}