"use strict";

var L = require('leaflet'),
    utils = require('./utils'),
    Backbone = require('../../shim/backbone'),
    Marionette = require('../../shim/backbone.marionette'),
    coreUnits = require('./units'),
    pointSourcePopupTmpl = require('./templates/pointSourcePopup.html');

// Increase or decrease the marker size based on the map zoom level
var markerSizesForZoomLevels = [
    0.05, 0.1, 0.2, 0.25, 0.5, 0.75, 1, 1.25, 1.75,
    2, 2.25, 3, 6, 8, 10, 10, 10, 10, 10
];

var Layer = {
    createLayer: function(geojsonFeatureCollection, leafletMap) {
        return L.geoJson(JSON.parse(geojsonFeatureCollection), {
            pointToLayer: function (feature, latlng) {
                return L.circleMarker(latlng, {
                    fillColor: "#ff7800",
                    weight: 0,
                    fillOpacity: 0.75
                });
            },

            onEachFeature: function(feature, marker) {
                var model = new Backbone.Model(feature.properties),
                    view = new PointSourcePopupView({ model: model });

                leafletMap.on('zoomend', function(e) {
                    var newZoomLevel = e.target._zoom;

                    marker.setStyle({
                        radius: markerSizesForZoomLevels[newZoomLevel]
                    });
                });

                marker.bindPopup(view.render().el);
            },
        });
    }
};

var PointSourcePopupView = Marionette.ItemView.extend({
    template: pointSourcePopupTmpl,
    className: 'point-source-popup',

    templateHelpers: function() {
        var mgd = coreUnits.get('VOLUMETRICFLOWRATE', this.model.get('mgd')),
            kgn = coreUnits.get('MASSPERTIME', this.model.get('kgn_yr')),
            kgp = coreUnits.get('MASSPERTIME', this.model.get('kgp_yr'));

        return {
            mgd: mgd.value,
            kgn_yr: kgn.value,
            kgp_yr: kgp.value,
            volumetricFlowRateUnit: mgd.unit,
            massPerTimeUnit: kgn.unit,
            noData: utils.noData
        };
    }
});

module.exports.Layer = Layer;
module.exports.PointSourcePopupView = PointSourcePopupView;
