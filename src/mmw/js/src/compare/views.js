"use strict";

var _ = require('lodash'),
    $ = require('jquery'),
    moment = require('moment'),
    Marionette = require('../../shim/backbone.marionette'),
    App = require('../app'),
    coreModels = require('../core/models'),
    coreUtils = require('../core/utils'),
    coreViews = require('../core/views'),
    chart = require('../core/chart.js'),
    modalViews = require('../core/modals/views'),
    models = require('./models'),
    modelingModels = require('../modeling/models'),
    modelingViews = require('../modeling/views'),
    tr55Models = require('../modeling/tr55/models'),
    PrecipitationView = require('../modeling/controls').PrecipitationView,
    modConfigUtils = require('../modeling/modificationConfigUtils'),
    gwlfeConfig = require('../modeling/gwlfeModificationConfig'),
    compareWindowTmpl = require('./templates/compareWindow.html'),
    compareWindow2Tmpl = require('./templates/compareWindow2.html'),
    compareTabPanelTmpl = require('./templates/compareTabPanel.html'),
    compareInputsTmpl = require('./templates/compareInputs.html'),
    compareSelectionTmpl = require('./templates/compareSelection.html'),
    tr55CompareScenarioItemTmpl = require('./templates/tr55CompareScenarioItem.html'),
    gwlfeCompareScenarioItemTmpl = require('./templates/gwlfeCompareScenarioItem.html'),
    compareBarChartRowTmpl = require('./templates/compareBarChartRow.html'),
    compareLineChartRowTmpl = require('./templates/compareLineChartRow.html'),
    compareTableRowTmpl = require('./templates/compareTableRow.html'),
    compareScenariosTmpl = require('./templates/compareScenarios.html'),
    compareScenarioTmpl = require('./templates/compareScenario.html'),
    compareModelingTmpl = require('./templates/compareModeling.html'),
    compareModificationsTmpl = require('./templates/compareModifications.html'),
    compareModificationsPopoverTmpl = require('./templates/compareModificationsPopover.html'),
    compareDescriptionPopoverTmpl = require('./templates/compareDescriptionPopover.html');

var SCENARIO_COLORS =  ['#3366cc','#dc3912','#ff9900','#109618','#990099',
        '#0099c6','#dd4477', '#66aa00','#b82e2e','#316395','#3366cc','#994499',
        '#22aa99','#aaaa11', '#6633cc','#e67300','#8b0707','#651067','#329262',
        '#5574a6','#3b3eac', '#b77322','#16d620','#b91383','#f4359e','#9c5935',
        '#a9c413','#2a778d', '#668d1c','#bea413','#0c5922','#743411'],
    monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    hydrologyKeys = Object.freeze({
        streamFlow: 'AvStreamFlow',
        surfaceRunoff: 'AvRunoff',
        subsurfaceFlow: 'AvGroundWater',
        pointSourceFlow: 'AvPtSrcFlow',
        evapotranspiration: 'AvEvapoTrans',
        precipitation: 'AvPrecipitation',
    });


var CompareWindow2 = modalViews.ModalBaseView.extend({
    template: compareWindow2Tmpl,

    id: 'compare-new',

    ui: {
        closeButton: '.compare-close > button',
        nextButton: '.compare-scenario-buttons > .btn-next-scenario',
        prevButton: '.compare-scenario-buttons > .btn-prev-scenario',
        spinner: '.spinner',
    },

    events: _.defaults({
        'click @ui.closeButton': 'hide',
        'click @ui.nextButton' : 'nextScenario',
        'click @ui.prevButton' : 'prevScenario',
    }, modalViews.ModalBaseView.prototype.events),

    modelEvents: {
        'change:mode': 'showSectionsView',
        'change:visibleScenarioIndex': 'highlightButtons',
        'change:polling': 'setPolling',
    },

    regions: {
        tabRegion: '.compare-tabs',
        inputsRegion: '.compare-inputs',
        scenariosRegion: '#compare-title-row',
        selectionRegion: '#compare-selection-region',
        sectionsRegion: '.compare-sections',
    },

    initialize: function() {
        var self = this;

        // Show the scenario row only after the bootstrap
        // modal has fired its shown event. The map
        // set up in the scenarios row needs to happen
        // after it has fully rendered
        this.$el.on('shown.bs.modal', function() {
            self.scenariosRegion.show(new ScenariosRowView({
                model: self.model,
                collection: self.model.get('scenarios'),
            }));
        });
    },

    highlightButtons: function() {
        var i = this.model.get('visibleScenarioIndex'),
            total = this.model.get('scenarios').length,
            minScenarios = models.constants.MIN_VISIBLE_SCENARIOS,
            prevButton = this.ui.prevButton,
            nextButton = this.ui.nextButton;

        if (total <= minScenarios) {
            prevButton.hide();
            nextButton.hide();
        } else {
            if (i < 1) {
                prevButton.removeClass('active');
            } else {
                prevButton.addClass('active');
            }

            if (i + minScenarios >= total) {
                nextButton.removeClass('active');
            } else {
                nextButton.addClass('active');
            }
        }
    },

    onShow: function() {
        var tabPanelsView = new TabPanelsView({
                collection: this.model.get('tabs'),
            }),
            showSectionsView = _.bind(this.showSectionsView, this);

        tabPanelsView.on('renderTabs', showSectionsView);

        this.tabRegion.show(tabPanelsView);
        this.inputsRegion.show(new InputsView({
            model: this.model,
        }));

        showSectionsView();
        this.highlightButtons();
        this.setPolling();
    },

    showSectionsView: function() {
        var activeTab = this.model.get('tabs').findWhere({ active: true });

        switch (this.model.get('modelPackage')) {
            case coreUtils.GWLFE:
                this.showGWLFESectionsView();
                this.showSelectionView(activeTab);
                break;
            case coreUtils.TR55_PACKAGE:
                this.showTR55SectionsView();
                break;
            default:
                window.console.warn('Invalid model package', this.model.get('modelPackage'));
                break;
        }
    },

    showTR55SectionsView: function() {
        if (this.model.get('mode') === models.constants.CHARTS) {
            this.sectionsRegion.show(new Tr55ChartView({
                model: this.model,
                collection: this.model.get('tabs')
                                .findWhere({ active: true })
                                .get('charts'),
            }));
        } else {
            this.sectionsRegion.show(new TableView({
                model: this.model,
                collection: this.model.get('tabs')
                                .findWhere({ active: true })
                                .get('table'),
            }));
        }
    },

    showGWLFESectionsView: function() {
        var activeTab = this.model.get('tabs').findWhere({ active: true }),
            activeName = activeTab.get('name'),
            activeMode = this.model.get('mode'),
            isHydrology = activeName === models.constants.HYDROLOGY,
            config = { model: this.model, collection: activeTab.get(activeMode) },
            View = (function() {
                    if (activeMode === models.constants.CHARTS) {
                        return isHydrology ?
                            GWLFEHydrologyChartView : GwlfeQualityChartView;
                    } else {
                        return isHydrology ?
                            GWLFEHydrologyTableView : GwlfeQualityTableView;
                    }
                })();

        if (View) {
            this.sectionsRegion.show(new View(config));
        } else {
            this.sectionsRegion.empty();
        }
    },

    showSelectionView: function(activeTab) {
        var activeMode = this.model.get('mode'),
            chartsOrTable = activeTab.get(activeMode),
            selections = activeTab.get('selections'),
            isHydrologyChart = activeMode === models.constants.CHARTS &&
                    activeTab.get('name') === models.constants.HYDROLOGY,
            update = function() {
                chartsOrTable.update(selections.findWhere({ active: true }));
            };

        // Remove old listeners
        this.model.get('tabs').forEach(function(tab) {
            var tabSelections = tab.get('selections');

            if (tabSelections) {
                tabSelections.off();
            }
        });

        if (selections && !isHydrologyChart) {
            this.selectionRegion.show(new SelectionView({
                model: activeTab,
            }));

            selections.on('change', update);
            update();
        } else {
            this.selectionRegion.empty();
        }
    },

    onModalHidden: function() {
        App.rootView.compareRegion.empty();
    },

    nextScenario: function() {
        var visibleScenarioIndex = this.model.get('visibleScenarioIndex'),
            last = Math.max(0, this.model.get('scenarios').length -
                               models.constants.MIN_VISIBLE_SCENARIOS);

        this.model.set({
            visibleScenarioIndex: Math.min(++visibleScenarioIndex, last)
        });
    },

    prevScenario: function() {
        var visibleScenarioIndex = this.model.get('visibleScenarioIndex');

        this.model.set({
            visibleScenarioIndex: Math.max(--visibleScenarioIndex, 0)
        });
    },

    setPolling: function() {
        if (this.model.get('polling')) {
            this.ui.spinner.removeClass('hidden');
            this.sectionsRegion.$el.addClass('polling');
        } else {
            this.ui.spinner.addClass('hidden');
            this.sectionsRegion.$el.removeClass('polling');
        }
    },
});

var TabPanelView = Marionette.ItemView.extend({
    template: compareTabPanelTmpl,
    tagName: 'a',
    className: 'compare-tab',
    attributes: {
        href: '',
        role: 'tab',
    },

    modelEvents: {
        'change': 'render',
    },

    triggers: {
        'click': 'tab:clicked',
    },

    onRender: function() {
        if (this.model.get('active')) {
            this.$el.addClass('active');
        } else {
            this.$el.removeClass('active');
        }
    },
});

var TabPanelsView = Marionette.CollectionView.extend({
    childView: TabPanelView,

    onChildviewTabClicked: function(view) {
        if (view.model.get('active')) {
            // Active tab clicked. Do nothing.
            return;
        }

        this.collection.findWhere({ active: true })
                       .set({ active: false });

        view.model.set({ active: true });

        this.triggerMethod('renderTabs');
    },
});

var InputsView = Marionette.LayoutView.extend({
    template: compareInputsTmpl,

    ui: {
        chartButton: '#compare-input-button-chart',
        tableButton: '#compare-input-button-table',
        downloadButton: '#compare-input-button-download'
    },

    events: {
        'click @ui.chartButton': 'setChartView',
        'click @ui.tableButton': 'setTableView',
        'click @ui.downloadButton': 'downloadCSV'
    },

    regions: {
        precipitationRegion: '.compare-precipitation',
    },

    modelEvents: {
        'change:polling': 'toggleDownloadButtonActive'
    },

    toggleDownloadButtonActive: function() {
        this.ui.downloadButton.prop('disabled', this.model.get('polling'));
    },

    onShow: function() {
        var addOrReplaceInput = _.bind(this.model.addOrReplaceInput, this.model),
            controlModel = this.model.get('scenarios')
                               .findWhere({ active: true })
                               .get('inputs')
                               .findWhere({ name: 'precipitation' }),
            precipitationModel = this.model.get('controls')
                                     .findWhere({ name: 'precipitation' }),
            showPrecipitationSlider = controlModel && precipitationModel;

        if (showPrecipitationSlider) {
            this.precipitationRegion.show(new PrecipitationView({
                model: precipitationModel,
                controlModel: controlModel,
                addOrReplaceInput: addOrReplaceInput,
            }));
        }
    },

    setChartView: function() {
        this.ui.chartButton.addClass('active');
        this.ui.tableButton.removeClass('active');
        this.model.set({ mode: models.constants.CHARTS });
    },

    setTableView: function() {
        this.ui.chartButton.removeClass('active');
        this.ui.tableButton.addClass('active');
        this.model.set({ mode: models.constants.TABLE });
    },

    downloadCSV: function() {
        var aoi = App.currentProject.get('area_of_interest'),
            aoiVolumeModel = new tr55Models.AoiVolumeModel({ areaOfInterest: aoi }),
            csvHeadings = [['scenario_name', 'precipitation_cm', 'runoff_cm',
                'evapotranspiration_cm', 'infiltration_cm', 'tss_load_cm', 'tss_runoff_cm',
                'tss_loading_rate_kgha', 'tn_load_cm', 'tn_runoff_cm', 'tn_loading_rate_kgha',
                'tp_load_cm', 'tp_runoff_cm', 'tp_loading_rate_kgha']],
            precipitation = this.model.get('scenarios')
                .findWhere({ active: true })
                .get('inputs')
                .findWhere({ name: 'precipitation' })
                .get('value'),
            csvData = this.model.get('scenarios')
                .map(function(scenario) {
                    var result = scenario
                            .get('results')
                            .findWhere({ name: 'runoff' })
                            .get('result'),
                        isPreColumbian = scenario.get('is_pre_columbian') || false,
                        isCurrentConditions = scenario.get('is_current_conditions'),
                        runoff,
                        quality,
                        tss,
                        tn,
                        tp;

                    if (isPreColumbian) {
                        runoff = result.runoff.pc_unmodified;
                        quality = result.quality.pc_unmodified;
                    } else if (isCurrentConditions) {
                        runoff = result.runoff.unmodified;
                        quality = result.quality.unmodified;
                    } else {
                        runoff = result.runoff.modified;
                        quality = result.quality.modified;
                    }

                    tss = quality[0];
                    tn = quality[1];
                    tp = quality[2];

                    return [
                        scenario.get('name'),
                        coreUtils.convertToMetric(precipitation, 'in').toFixed(2),
                        runoff.runoff,
                        runoff.et,
                        runoff.inf,
                        tss.load,
                        tss.runoff,
                        aoiVolumeModel.getLoadingRate(tss.load),
                        tn.load,
                        tn.runoff,
                        aoiVolumeModel.getLoadingRate(tn.load),
                        tp.load,
                        tp.runoff,
                        aoiVolumeModel.getLoadingRate(tp.load),
                    ];
                }),
            csv = csvHeadings
                .concat(csvData)
                .map(function (data) {
                    return data.join(', ');
                })
                .join('\n'),
            projectName = this.model.get('projectName'),
            timeStamp = moment().format('MMDDYYYYHHmmss'),
            fileName = projectName.replace(/[^a-z0-9+]+/gi, '_') + '_' +
                timeStamp + '.csv';

        coreUtils.downloadAsFile(csv, fileName);
    }
});

var SelectionView = Marionette.ItemView.extend({
    // model: TabModel
    template: compareSelectionTmpl,
    tagName: 'select',
    className: 'form-control btn btn-small btn-primary',

    events: {
        'change': 'select',
    },

    templateHelpers: function() {
        var groups = [];

        this.model.get('selections').forEach(function(opt) {
            var group = _.find(groups, { name: opt.get('groupName') });

            if (group === undefined) {
                group = { name: opt.get('groupName'), options: [] };
                groups.push(group);
            }

            group.options.push({
                name: opt.get('name'),
                active: opt.get('active'),
                value: opt.get('value'),
            });
        });

        return {
            groups: groups,
        };
    },

    select: function() {
        var selections = this.model.get('selections');
        var newValue = this.$el.val();

        selections
            .invoke('set', { active: false }, { silent: true });

        selections
            .findWhere({ value: newValue })
            .set({ active: true });
    }
});

var CompareModificationsPopoverView = Marionette.ItemView.extend({
    // model: ModificationsCollection
    template: compareModificationsPopoverTmpl,

    templateHelpers: function() {
        var isTr55 = App.currentProject.get('model_package') ===
                     coreUtils.TR55_PACKAGE,
            gwlfeModifications = isTr55 ? [] : _.flatten(
                this.model.map(function(m) {
                    return _.map(m.get('userInput'), function(value, key) {
                        return {
                            name: m.get('modKey'),
                            value: value,
                            input: gwlfeConfig.displayNames[key],
                        };
                    });
                })
            );

        return {
            isTr55: isTr55,
            gwlfeModifications: gwlfeModifications,
            conservationPractices: this.model.filter(function(modification) {
                return modification.get('name') === 'conservation_practice';
            }),
            landCovers: this.model.filter(function(modification) {
                return modification.get('name') === 'landcover';
            }),
            modConfigUtils: modConfigUtils
        };
    }
});

var CompareDescriptionPopoverView = Marionette.ItemView.extend({
    // model: ScenarioModel
    template: compareDescriptionPopoverTmpl,
    className: 'compare-no-mods-popover',

    templateHelpers: function() {
        return {
            isTr55: App.currentProject.get('model_package') ===
                    coreUtils.TR55_PACKAGE,
        };
    },
});

var GWLFEScenarioItemView = Marionette.ItemView.extend({
    className: 'compare-column -gwlfe',
    template: gwlfeCompareScenarioItemTmpl,

    attributes: {
        'data-html': 'true',
        'data-toggle': 'popover',
    },

    onRender: function() {
        var modifications = this.model.get('modifications'),
            popOverView = modifications.length > 0 ?
                new CompareModificationsPopoverView({
                    model: modifications
                }) :
                new CompareDescriptionPopoverView({
                    model: this.model
                });

        var popOverEl = popOverView.render().el;

        this.$el.popover({
            placement: 'bottom',
            trigger: 'hover focus',
            content: popOverEl
        });
    },
});

var TR55ScenarioItemView = Marionette.ItemView.extend({
    className: 'compare-column -tr55',
    template: tr55CompareScenarioItemTmpl,

    ui: {
        'mapContainer': '.compare-map-container',
    },

    onShow: function() {
        var mapView = new coreViews.MapView({
            model: new coreModels.MapModel({
                'areaOfInterest': App.currentProject.get('area_of_interest'),
                'areaOfInterestName': App.currentProject.get('area_of_interest_name'),
            }),
            el: this.ui.mapContainer,
            addZoomControl: false,
            addLocateMeButton: false,
            addSidebarToggleControl: false,
            showLayerAttribution: false,
            initialLayerName: App.getLayerTabCollection().getCurrentActiveBaseLayerName(),
            layerTabCollection: new coreModels.LayerTabCollection(),
            interactiveMode: false,
        });
        mapView.updateAreaOfInterest();
        mapView.updateModifications(this.model);
        mapView.fitToModificationsOrAoi();
        mapView.render();
    },

    onRender: function() {
        var modifications = this.model.get('modifications'),
            popOverView = modifications.length > 0 ?
                              new CompareModificationsPopoverView({
                                  model: modifications
                              }) :
                              new CompareDescriptionPopoverView({
                                  model: this.model
                              });

        this.ui.mapContainer.popover({
            placement: 'bottom',
            trigger: 'hover focus',
            content: popOverView.render().el
        });
    }
});

var ScenariosRowView = Marionette.CollectionView.extend({
    className: 'compare-scenario-row-content',
    getChildView: function() {
        if (this.model.get('modelPackage') === coreUtils.TR55_PACKAGE) {
            return TR55ScenarioItemView;
        } else {
            return GWLFEScenarioItemView;
        }
    },

    modelEvents: {
        'change:visibleScenarioIndex': 'slide',
    },

    slide: function() {
        var i = this.model.get('visibleScenarioIndex'),
            width = models.constants.COMPARE_COLUMN_WIDTH,
            marginLeft = -i * width;

        this.$el.css({
            'margin-left': marginLeft + 'px',
        });
    }
});

var Tr55BarChartRowView = Marionette.ItemView.extend({
    model: models.BarChartRowModel,
    className: 'compare-chart-row',
    template: compareBarChartRowTmpl,

    modelEvents: {
        'change:values': 'renderChart',
    },

    onAttach: function() {
        this.renderChart();
    },

    renderChart: function() {
        var self = this,
            chartDiv = this.model.get('chartDiv'),
            chartEl = document.getElementById(chartDiv),
            name = this.model.get('name'),
            chartName = name.replace(/\s/g, ''),
            label = this.model.get('unitLabel') +
                    ' (' + this.model.get('unit') + ')',
            colors = this.model.get('seriesColors'),
            stacked = name.indexOf('Hydrology') > -1,
            yMax = stacked ? this.model.get('precipitation') : null,
            values = this.model.get('values'),
            data = stacked ? ['inf', 'runoff', 'et'].map(function(key) {
                    return {
                        key: key,
                        values: values.map(function(value, index) {
                            return {
                                x: 'Series ' + index,
                                y: value[key],
                            };
                        })
                    };
                }) : [{
                    key: name,
                    values: values.map(function(value, index) {
                        return {
                            x: 'Series ' + index,
                            y: value,
                        };
                    }),
                }],
            onRenderComplete = function() {
                self.triggerMethod('chart:rendered');
            };

        $(chartEl.parentNode).css({ 'width': ((_.size(this.model.get('values')) * models.constants.COMPARE_COLUMN_WIDTH + models.constants.CHART_AXIS_WIDTH)  + 'px') });
        chart.renderCompareMultibarChart(
            chartEl, chartName, label, colors, stacked, yMax, data,
            models.constants.COMPARE_COLUMN_WIDTH, models.constants.CHART_AXIS_WIDTH, onRenderComplete);
    },
});

var LineChartRowView = Marionette.ItemView.extend({
    models: models.LineChartRowModel,
    className: 'compare-chart-row -line',
    template: compareLineChartRowTmpl,

    ui: function() {
        return {
            chartElement: '#' + this.model.get('chartDiv'),
        };
    },

    onAttach: function() {
        this.addChart();
    },

    onBeforeDestroy: function() {
        this.destroyChart();
    },

    onRender: function() {
        this.addChart();
    },

    addChart: function() {
        this.destroyChart();

        var scenarioNames = this.model.get('scenarioNames'),
            chartData = this.model.get('data')
                .map(function(scenarioData, index) {
                    return {
                        key: index,
                        values: scenarioData.map(function(val, x) {
                            return {
                                x: x,
                                y: Number(val),
                            };
                        }),
                        color: SCENARIO_COLORS[index % 32],
                    };
                })
                .slice()
                .reverse(),
            chartOptions = {
                yAxisLabel: 'Water Depth (cm)',
                yAxisUnit: 'cm',
                xAxisLabel: function(xValue) {
                    return monthNames[xValue];
                },
                xTickValues: _.range(12),
            },
            tooltipKeyFormatFn = function(d) {
                return scenarioNames[d];
            };

        if (chartData.length && this.ui.chartElement) {
            chart.renderLineChart(this.ui.chartElement, chartData, chartOptions, tooltipKeyFormatFn);
        }
    },

    destroyChart: function() {
        this.ui.chartElement.empty();
    },
});

var GWLFEHydrologyChartView = Marionette.CollectionView.extend({
    childView: LineChartRowView,
});

var GwlfeBarChartRowView = Marionette.ItemView.extend({
    className: 'compare-chart-row',
    template: compareBarChartRowTmpl,

    modelEvents: {
        'change:values': 'renderChart',
    },

    onAttach: function() {
        this.renderChart();
    },

    renderChart: function() {
        var self = this,
            chartDiv = this.model.get('chartDiv'),
            chartEl = document.getElementById(chartDiv),
            chartName = this.model.get('key'),
            values = this.model.get('values'),
            data = [{
                key: chartName,
                values: values,
            }],
            parentWidth = (_.size(values) *
                models.constants.COMPARE_COLUMN_WIDTH +
                models.constants.CHART_AXIS_WIDTH) + 'px',
            options = {
                yAxisLabel: this.model.get('unitLabel'),
                yAxisUnit: this.model.get('unit'),
                colors: SCENARIO_COLORS,
                columnWidth: models.constants.COMPARE_COLUMN_WIDTH,
                xAxisWidth: models.constants.CHART_AXIS_WIDTH,
                onRenderComplete: function() {
                    self.triggerMethod('chart:rendered');
                },
            };

        $(chartEl.parentNode).css({ width: parentWidth });
        chart.renderDiscreteBarChart(chartEl, data, options);
    },
});

var ChartView = Marionette.CollectionView.extend({
    modelEvents: {
        'change:visibleScenarioIndex': 'slide',
    },

    onRender: function() {
        // To initialize chart correctly when switching between tabs
        this.slide();
    },

    onChildviewChartRendered: function() {
        // Update chart status after it is rendered
        this.slide();
    },

    slide: function() {
        var i = this.model.get('visibleScenarioIndex'),
            width = models.constants.COMPARE_COLUMN_WIDTH,
            marginLeft = -i * width;

        // Slide charts
        this.$('.compare-scenario-row-content').css({
            'margin-left': marginLeft + 'px',
        });

        // Slide axis
        this.$('.nvd3.nv-wrap.nv-axis').css({
            'transform': 'translate(' + (-marginLeft) + 'px)',
        });

        // Slide clipPath so tooltips don't show outside charts
        // It doesn't matter too much what the y-translate is
        // so long as its sufficiently large
        this.$('defs > clipPath > rect').attr({
            'transform': 'translate(' + (-marginLeft) + ', -30)',
        });

        // Show charts from visibleScenarioIndex
        this.$('.nv-group > :nth-child(n + ' + (i+1) + ')').css({
            'opacity': '',
        });

        // Hide charts up to visibleScenarioIndex
        this.$('.nv-group > :nth-child(-n + ' + i + ')').css({
            'opacity': 0,
        });
    },
});

var Tr55ChartView = ChartView.extend({
    childView: Tr55BarChartRowView,
});

var GwlfeQualityChartView = ChartView.extend({
    childView: GwlfeBarChartRowView,
});

var TableRowView = Marionette.ItemView.extend({
    className: 'compare-table-row',
    template: compareTableRowTmpl,
});

var TableView = Marionette.CollectionView.extend({
    childView: TableRowView,
    collectionEvents: {
        'change': 'render',
    },

    modelEvents: {
        'change:visibleScenarioIndex': 'slide',
    },

    onRender: function() {
        // To initialize table correctly when switching between tabs,
        // and when receiving new values from server
        this.slide();
    },

    slide: function() {
        var i = this.model.get('visibleScenarioIndex'),
            width = models.constants.COMPARE_COLUMN_WIDTH,
            marginLeft = -i * width;

        this.$('.compare-scenario-row-content').css({
            'margin-left': marginLeft + 'px',
        });
    }
});

var GWLFEHydrologyTableRowView = TableRowView.extend({
    models: models.MonthlyTableRowModel,
    className: 'compare-table-row -hydrology',
    template: compareTableRowTmpl,

    templateHelpers: function() {
        var selectedAttribute = this.model.get('selectedAttribute');

        return {
            values: this.model
                .get('values')
                .map(function(v) {
                    return v[selectedAttribute];
                }),
        };
    },
});

var GWLFEHydrologyTableView = TableView.extend({
    childView: GWLFEHydrologyTableRowView,
});

var GwlfeQualityTableRowView = TableRowView.extend({
    className: 'compare-table-row -gwlfe -quality',
});

var GwlfeQualityTableView = TableView.extend({
    childView: GwlfeQualityTableRowView,
});

var CompareWindow = Marionette.LayoutView.extend({
    //model: modelingModels.ProjectModel,

    template: compareWindowTmpl,

    id: 'compare-window',

    regions: {
        containerRegion: '#compare-scenarios-region'
    },

    ui: {
        'slideLeft': '#slide-left',
        'slideRight': '#slide-right'
    },

    events: {
        'click @ui.slideLeft': 'slideLeft',
        'click @ui.slideRight': 'slideRight'
    },

    initialize: function() {
        // Left-most visible scenario
        this.slideInd = 0;

        // Resizing the window can change the column size,
        // so the offset of the container needs to be
        // recomputed.
        $(window).on('resize.app', _.debounce(_.bind(this.updateContainerPos, this)));
    },

    onDestroy: function() {
        $(window).off('resize.app');
    },

    getColumnWidth: function() {
        // Width is a function of screen size.
        return parseInt($('#compare-row td').css('width'));
    },

    getContainerWidth: function() {
        // Width is a function of screen size.
        return parseInt($('body').get(0).offsetWidth);
    },

    updateContainerPos: function() {
        var left = -1 * this.slideInd * this.getColumnWidth();
        $('.compare-scenarios-container').css('left', left + 'px');
    },

    slideLeft: function() {
        if (this.slideInd > 0) {
            this.slideInd--;
            this.updateContainerPos();
        }
    },

    slideRight: function() {
        var numScenarios = this.model.get('scenarios').length,
            maxVisColumns = Math.floor(this.getContainerWidth() / this.getColumnWidth());

        if (this.slideInd < numScenarios - maxVisColumns) {
            this.slideInd++;
            this.updateContainerPos();
        }
    },

    onShow: function() {
         this.containerRegion.show(new CompareScenariosView({
            model: this.model,
            collection: this.model.get('scenarios')
         }));
    }
});

var CompareScenarioView = Marionette.LayoutView.extend({
    //model: modelingModels.ScenarioModel,

    tagName: 'td',

    template: compareScenarioTmpl,

    templateHelpers: function() {
        return {
            scenarioName: this.model.get('name')
        };
    },

    regions: {
        mapRegion: '.map-region',
        modelingRegion: '.modeling-region',
        modificationsRegion: '.modifications-region'
    },

    initialize: function(options) {
        this.projectModel = options.projectModel;
        this.scenariosView = options.scenariosView;
    },

    onShow: function() {
        this.mapModel = new coreModels.MapModel({});
        this.LayerTabCollection = new coreModels.LayerTabCollection();
        this.mapModel.set({
            'areaOfInterest': this.projectModel.get('area_of_interest'),
            'areaOfInterestName': this.projectModel.get('area_of_interest_name')
        });
        this.mapView = new coreViews.MapView({
            model: this.mapModel,
            el: $(this.el).find('.map-container').get(),
            addZoomControl: false,
            addLocateMeButton: false,
            addSidebarToggleControl: false,
            showLayerAttribution: false,
            initialLayerName: App.getLayerTabCollection().getCurrentActiveBaseLayerName(),
            layerTabCollection: this.LayerTabCollection,
            interactiveMode: false
        });

        this.mapView.fitToAoi();
        this.mapView.updateAreaOfInterest();
        this.mapView.updateModifications(this.model);
        this.mapRegion.show(this.mapView);
        this.modelingRegion.show(new CompareModelingView({
            projectModel: this.projectModel,
            scenariosView: this.scenariosView,
            model: this.model
        }));

        this.modificationsRegion.show(new CompareModificationsView({
            model: this.model.get('modifications')
        }));
    }
});

var CompareScenariosView = Marionette.CompositeView.extend({
    //model: modelingModels.ProjectModel,
    //collection: modelingModels.ScenariosCollection,

    className: 'compare-scenarios-container',

    template: compareScenariosTmpl,

    childViewContainer: '#compare-row',
    childView: CompareScenarioView,
    childViewOptions: function() {
        return {
            scenariosView: this,
            projectModel: this.model
        };
    },

    initialize: function() {
        this.modelingViews = [];
    }
});

var CompareModelingView = Marionette.LayoutView.extend({
    //model: modelingModels.ScenarioModel

    template: compareModelingTmpl,

    className: 'modeling-container',

    regions: {
        resultRegion: '.result-region',
        controlsRegion: '.controls-region'
    },

    ui: {
        resultSelector: 'select'
    },

    events: {
        'change @ui.resultSelector': 'updateResult'
    },

    initialize: function(options) {
        this.projectModel = options.projectModel;
        this.model.get('results').makeFirstActive();
        this.listenTo(this.model.get('results').at(0), 'change:polling', function() {
            this.render();
            this.onShow();
        });
        this.scenariosView = options.scenariosView;
        this.scenariosView.modelingViews.push(this);
    },

    templateHelpers: function() {
        return {
            polling: this.model.get('results').at(0).get('polling'),
            results: this.model.get('results').toJSON()
        };
    },

    updateResult: function() {
        var selection = this.ui.resultSelector.val();

        this.model.get('results').setActive(selection);
        this.showResult();

        _.forEach(this.scenariosView.modelingViews, function(sibling) {
            if (sibling.ui.resultSelector.val() === selection) {
                return;
            } else {
                sibling.ui.resultSelector.val(selection);
                sibling.model.get('results').setActive(selection);
                sibling.showResult();
            }
        });

    },

    showResult: function() {
        var modelPackage = App.currentProject.get('model_package'),
            resultModel = this.model.get('results').getActive(),
            ResultView = modelingViews.getResultView(modelPackage, resultModel.get('name'));

        this.resultRegion.show(new ResultView({
            areaOfInterest: this.projectModel.get('area_of_interest'),
            model: resultModel,
            scenario: this.model,
            compareMode: true
        }));
    },

    showControls: function() {
        var controls = modelingModels.getControlsForModelPackage(
            this.projectModel.get('model_package'),
            {compareMode: true}
        );

        // TODO this needs to be generalized if we want the compare view
        // to work with GWLF-E
        this.controlsRegion.show(new modelingViews.Tr55ToolbarView({
            model: this.model,
            collection: controls,
            compareMode: true
        }));
    },

    onShow: function() {
        this.showResult();
        this.showControls();
    }
});

var CompareModificationsView = Marionette.ItemView.extend({
    //model: modelingModels.ModificationsCollection,
    template: compareModificationsTmpl,

    className: 'modifications-container',

    templateHelpers: function() {
        return {
            conservationPractices: this.model.filter(function(modification) {
                return modification.get('name') === 'conservation_practice';
            }),
            landCovers: this.model.filter(function(modification) {
                return modification.get('name') === 'landcover';
            }),
            modConfigUtils: modConfigUtils
        };
    }
});

function getTr55Tabs(scenarios) {
    // TODO Account for loading and error scenarios
    var aoi = App.currentProject.get('area_of_interest'),
        aoiVolumeModel = new tr55Models.AoiVolumeModel({ areaOfInterest: aoi }),
        runoffTable = new models.Tr55RunoffTable({ scenarios: scenarios }),
        runoffCharts = new models.Tr55RunoffCharts([
            {
                key: 'combined',
                name: 'Combined Hydrology',
                chartDiv: 'combined-hydrology-chart',
                seriesColors: ['#F8AA00', '#CF4300', '#C2D33C'],
                legendItems: [
                    {
                        name: 'Evapotranspiration',
                        badgeId: 'evapotranspiration-badge',
                    },
                    {
                        name: 'Runoff',
                        badgeId: 'runoff-badge',
                    },
                    {
                        name: 'Infiltration',
                        badgeId: 'infiltration-badge',
                    },
                ],
                unit: 'cm',
                unitLabel: 'Level',
            },
            {
                key: 'et',
                name: 'Evapotranspiration',
                chartDiv: 'evapotranspiration-chart',
                seriesColors: ['#C2D33C'],
                legendItems: null,
                unit: 'cm',
                unitLabel: 'Level',
            },
            {
                key: 'runoff',
                name: 'Runoff',
                chartDiv: 'runoff-chart',
                seriesColors: ['#CF4300'],
                legendItems: null,
                unit: 'cm',
                unitLabel: 'Level',
            },
            {
                key: 'inf',
                name: 'Infiltration',
                chartDiv: 'infiltration-chart',
                seriesColors: ['#F8AA00'],
                legendItems: null,
                unit: 'cm',
                unitLabel: 'Level',
            }
        ], { scenarios: scenarios }),
        qualityTable = new models.Tr55QualityTable({
            scenarios: scenarios,
            aoiVolumeModel: aoiVolumeModel,
        }),
        qualityCharts = new models.Tr55QualityCharts([
            {
                name: 'Total Suspended Solids',
                chartDiv: 'tss-chart',
                seriesColors: ['#389b9b'],
                legendItems: null,
                unit: 'kg/ha',
                unitLabel: 'Loading Rate',
            },
            {
                name: 'Total Nitrogen',
                chartDiv: 'tn-chart',
                seriesColors: ['#389b9b'],
                legendItems: null,
                unit: 'kg/ha',
                unitLabel: 'Loading Rate',
            },
            {
                name: 'Total Phosphorus',
                chartDiv: 'tp-chart',
                seriesColors: ['#389b9b'],
                legendItems: null,
                unit: 'kg/ha',
                unitLabel: 'Loading Rate',
            }
        ], { scenarios: scenarios, aoiVolumeModel: aoiVolumeModel });

    return new models.TabsCollection([
        {
            name: 'Runoff',
            table: runoffTable,
            charts: runoffCharts,
            active: true,
        },
        {
            name: 'Water Quality',
            table: qualityTable,
            charts: qualityCharts,
        },
    ]);
}

function mapScenariosToHydrologyChartData(scenarios, key) {
    return scenarios
        .map(function(scenario) {
            return scenario
                .get('results')
                .models
                .reduce(function(accumulator, next) {
                    if (next.get('displayName') !== models.constants.HYDROLOGY) {
                        return accumulator;
                    }

                    return accumulator.concat(next
                        .get('result')
                        .monthly
                        .map(function(result) {
                            return result[key];
                        }));
                }, []);
        });
}

function mapScenariosToHydrologyTableData(scenarios) {
    var scenarioData = scenarios
            .models
            .reduce(function(accumulator, next) {
                var results = next.get('results'),
                    nextAttribute = results
                        .filter(function(n) {
                            return n.get('displayName') === models.constants.HYDROLOGY;
                        })
                        .map(function(m) {
                            return m
                                .get('result')
                                .monthly;
                        });

                return accumulator.concat(nextAttribute);
            }, []),
        tableData = monthNames
            .map(function(name, key) {
                return {
                    key: key,
                    name: moment(name, 'MMM').format('MMMM'),
                    unit: 'cm',
                    values: scenarioData
                        .map(function(element) {
                            return element[key];
                        }),
                    selectedAttribute: hydrologyKeys.streamFlow,
                };
            });

    return tableData;
}

function getGwlfeTabs(scenarios) {
    var hydrologyTable = new models.GwlfeHydrologyTable(mapScenariosToHydrologyTableData(scenarios)),
        scenarioNames = scenarios.map(function(s) {
            return s.get('name');
        }),
        hydrologyCharts = new models.GwlfeHydrologyCharts([
            {
                key: hydrologyKeys.streamFlow,
                name: 'Stream Flow',
                chartDiv: 'hydrology-stream-flow-chart',
                data: mapScenariosToHydrologyChartData(scenarios, hydrologyKeys.streamFlow),
                scenarioNames: scenarioNames,
            },
            {
                key: hydrologyKeys.surfaceRunoff,
                name: 'Surface Runoff',
                chartDiv: 'hydrology-surface-runoff-chart',
                data: mapScenariosToHydrologyChartData(scenarios, hydrologyKeys.surfaceRunoff),
                scenarioNames: scenarioNames,
            },
            {
                key: hydrologyKeys.subsurfaceFlow,
                name: 'Subsurface Flow',
                chartDiv: 'hydrology-subsurface-flow-chart',
                data: mapScenariosToHydrologyChartData(scenarios, hydrologyKeys.subsurfaceFlow),
                scenarioNames: scenarioNames,
            },
            {
                key: hydrologyKeys.pointSourceFlow,
                name: 'Point Source Flow',
                chartDiv: 'hydrology-point-source-flow-chart',
                data: mapScenariosToHydrologyChartData(scenarios, hydrologyKeys.pointSourceFlow),
                scenarioNames: scenarioNames,
            },
            {
                key: hydrologyKeys.evapotranspiration,
                name: 'Evapotranspiration',
                chartDiv: 'hydrology-evapotranspiration-chart',
                data: mapScenariosToHydrologyChartData(scenarios, hydrologyKeys.evapotranspiration),
                scenarioNames: scenarioNames,
            },
            {
                key: hydrologyKeys.precipitation,
                name: 'Precipitation',
                chartDiv: 'hydrology-precipitation-chart',
                data: mapScenariosToHydrologyChartData(scenarios, hydrologyKeys.precipitation),
                scenarioNames: scenarioNames,
            },
        ], { scenarios: scenarios }),
        hydrologySelections = new models.SelectionOptionsCollection([
            { groupName: 'Water Flow', name: 'Stream Flow', value: hydrologyKeys.streamFlow, active: true },
            { groupName: 'Water Flow', name: 'Surface Runoff', value: hydrologyKeys.surfaceRunoff },
            { groupName: 'Water Flow', name: 'Subsurface Flow', value: hydrologyKeys.subsurfaceFlow },
            { groupName: 'Water Flow', name: 'Point Source Flow', value: hydrologyKeys.pointSourceFlow },
            { groupName: 'Water Flow', name: 'Evapotranspiration', value: hydrologyKeys.evapotranspiration },
            { groupName: 'Water Flow', name: 'Precipitation', value: hydrologyKeys.precipitation },
        ]),
        qualityTable = new models.GwlfeQualityTable({
            scenarios: scenarios,
        }),
        qualityCharts = new models.GwlfeQualityCharts([
            {
                name: 'Sediment',
                key: 'Sediment',
                chartDiv: 's-chart',
                unit: 'kg',
            },
            {
                name: 'Total Nitrogen',
                key: 'TotalN',
                chartDiv: 'tn-chart',
                unit: 'kg',
            },
            {
                name: 'Total Phosphorus',
                key: 'TotalP',
                chartDiv: 'tp-chart',
                unit: 'kg',
            }
        ], { scenarios: scenarios }),
        qualitySelections = new models.SelectionOptionsCollection([
            { group: 'SummaryLoads', groupName: 'Summary', name: 'Total Loads', unit: 'kg', active: true },
            { group: 'SummaryLoads', groupName: 'Summary', name: 'Loading Rates', unit: 'kg/ha' },
            { group: 'SummaryLoads', groupName: 'Summary', name: 'Mean Annual Concentration', unit: 'mg/l' },
            { group: 'SummaryLoads', groupName: 'Summary', name: 'Mean Low-Flow Concentration', unit: 'mg/l' },
            { group: 'Loads', groupName: 'Land Use', name: 'Hay/Pasture', unit: 'kg' },
            { group: 'Loads', groupName: 'Land Use', name: 'Cropland', unit: 'kg' },
            { group: 'Loads', groupName: 'Land Use', name: 'Wooded Areas', unit: 'kg' },
            { group: 'Loads', groupName: 'Land Use', name: 'Wetlands', unit: 'kg' },
            { group: 'Loads', groupName: 'Land Use', name: 'Open Land', unit: 'kg' },
            { group: 'Loads', groupName: 'Land Use', name: 'Barren Areas', unit: 'kg' },
            { group: 'Loads', groupName: 'Land Use', name: 'Low-Density Mixed', unit: 'kg' },
            { group: 'Loads', groupName: 'Land Use', name: 'Medium-Density Mixed', unit: 'kg' },
            { group: 'Loads', groupName: 'Land Use', name: 'High-Density Mixed', unit: 'kg' },
            { group: 'Loads', groupName: 'Land Use', name: 'Other Upland Areas', unit: 'kg' },
            { group: 'Loads', groupName: 'Land Use', name: 'Farm Animals', unit: 'kg' },
            { group: 'Loads', groupName: 'Land Use', name: 'Stream Bank Erosion', unit: 'kg' },
            { group: 'Loads', groupName: 'Land Use', name: 'Subsurface Flow', unit: 'kg' },
            { group: 'Loads', groupName: 'Land Use', name: 'Point Sources', unit: 'kg' },
            { group: 'Loads', groupName: 'Land Use', name: 'Septic Systems', unit: 'kg' },
        ]);

    return new models.TabsCollection([
        {
            name: 'Hydrology',
            table: hydrologyTable,
            charts: hydrologyCharts,
            active: true,
            selections: hydrologySelections,
        },
        {
            name: 'Water Quality',
            table: qualityTable,
            charts: qualityCharts,
            selections: qualitySelections,
        },
    ]);
}

function copyScenario(scenario, aoi_census, color) {
    var newScenario = new modelingModels.ScenarioModel({}),
        fetchResults = _.bind(newScenario.fetchResults, newScenario),
        debouncedFetchResults = _.debounce(fetchResults, 500);

    newScenario.set({
        name: scenario.get('name'),
        is_current_conditions: scenario.get('is_current_conditions'),
        aoi_census: aoi_census,
        modifications: scenario.get('modifications'),
        modification_hash: scenario.get('modification_hash'),
        modification_censuses: scenario.get('modification_censuses'),
        results: new modelingModels.ResultCollection(scenario.get('results').toJSON()),
        inputs: new modelingModels.ModificationsCollection(scenario.get('inputs').toJSON()),
        inputmod_hash: scenario.get('inputmod_hash'),
        allow_save: false,
        active: scenario.get('active'),
        color: color,
    });

    newScenario.get('inputs').on('add', debouncedFetchResults);

    return newScenario;
}


// Makes a sandboxed copy of project scenarios which can be safely
// edited and experimented in the Compare Window, and discarded on close.
function getCompareScenarios(isTr55) {
    var trueScenarios = App.currentProject.get('scenarios'),
        tempScenarios = new modelingModels.ScenariosCollection(),
        ccScenario = trueScenarios.findWhere({ is_current_conditions: true }),
        aoi_census = ccScenario.get('aoi_census');

    if (isTr55) {
        // Add Predominantly Forested scenario
        var forestScenario = copyScenario(ccScenario, aoi_census);

        forestScenario.set({
            name: 'Predominantly Forested',
            is_current_conditions: false,
            is_pre_columbian: true,
        });

        tempScenarios.add(forestScenario);
    }

    trueScenarios.forEach(function(scenario, index) {
        var color = SCENARIO_COLORS[index % 32];
        tempScenarios.add(copyScenario(scenario, aoi_census, color));
    });

    return tempScenarios;
}

function showCompare() {
    var model_package = App.currentProject.get('model_package'),
        projectName = App.currentProject.get('name'),
        isTr55 = model_package === coreUtils.TR55_PACKAGE,
        scenarios = getCompareScenarios(isTr55),
        tabs = isTr55 ? getTr55Tabs(scenarios) : getGwlfeTabs(scenarios),
        controlsJson = isTr55 ? [{ name: 'precipitation' }] : [],
        controls = new models.ControlsCollection(controlsJson),
        compareModel = new models.WindowModel({
            controls: controls,
            tabs: tabs,
            scenarios: scenarios,
            projectName: projectName,
            modelPackage: model_package,
        });

    if (isTr55) {
        // Set compare model to have same precipitation as active scenario
        compareModel.addOrReplaceInput(
            scenarios.findWhere({ active: true })
                     .get('inputs')
                     .findWhere({ name: 'precipitation' }));
    }

    App.rootView.compareRegion.show(new CompareWindow2({
        model: compareModel,
    }));
}

module.exports = {
    showCompare: showCompare,
    CompareWindow2: CompareWindow2,
    CompareWindow: CompareWindow,
    getTr55Tabs: getTr55Tabs
};
