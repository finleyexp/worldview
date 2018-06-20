import $ from 'jquery';
import 'jquery-ui/tabs';
import 'jquery-ui/dialog';
import 'perfect-scrollbar/jquery';
import lodashFind from 'lodash/find';
import util from '../util/util';
import { GA as googleAnalytics, Sidebar } from 'worldview-components';
import React from 'react';
import ReactDOM from 'react-dom';
import {
  getCompareObjects,
  getActiveLayerGroupString,
  getActiveDateString
} from '../compare/util';
import { layersOptions } from './options';
import { layersInfo } from './info';

export function layersSidebar(models, config) {
  var isCollapsed = false;
  var activeTab = 'layers';
  var isCompareMode = false;
  // var mobile = false;
  var self = {};
  var model = models.layers;
  var compareObj = {};
  var isCompareA = true;
  var compareModeType = 'swipe';
  self.events = util.events();

  self.id = 'productsHolder';
  self.selector = '#productsHolder';
  self.events = util.events();

  var init = function() {
    self.reactComponent = ReactDOM.render(
      React.createElement(Sidebar, getInitialProps()),
      document.getElementById('wv-sidebar')
    );
    model.events.on('add', updateLayer).on('remove', updateLayer);
    models.date.events.on('select', date => {
      console.log(date);
      if (models.date.activeDate === 'selected') {
        updateState('layers');
      } else {
        updateState('layerObjects');
      }
    });
  };
  self.sizeEventsTab = function() {};
  var getInitialProps = function() {
    var compareModel;
    if (config.features.compare) {
      compareModel = models.compare;
      if (models.compare.active) {
        isCompareA = compareModel.isCompareA;
        isCompareMode = compareModel.active;
        compareObj = getCompareObjects(models);
        compareModeType = compareModel.mode;
      }
    }
    return {
      activeTab: activeTab,
      isCompareMode: isCompareMode,
      isCollapsed: isCollapsed,
      layers: model.get({ group: 'all' }),
      onTabClick: onTabClick,
      toggleSidebar: toggleSidebar,
      toggleLayerVisibility: toggleLayerVisibility,
      tabTypes: getActiveTabs(),
      getNames: model.getTitles,
      firstDateObject: compareObj.a,
      secondDateObject: compareObj.b,
      getAvailability: getAvailability,
      toggleComparisonObject: toggleComparisonObject,
      toggleMode: toggleComparisonMode,
      isCompareA: isCompareA,
      updateLayer: updateLayer,
      addLayers: onAddLayerCLick,
      comparisonType: compareModeType,
      changeCompareMode: compareModel.setMode
    };
  };

  var getAvailability = function(id, isVisible, groupStr) {
    return model.available(id, isVisible, model[groupStr]);
  };

  // var changeDate = function() {
  //   var strGroup = getActiveDateString(isCompareMode, isCompareA);
  //   models.date.activeDate = strGroup;
  //   models.date.select(models.date[strGroup], strGroup);
  // };
  var toggleComparisonObject = function() {
    isCompareA = !isCompareA;
    models.compare.toggleState();
    models.date.activeDate = getActiveDateString(isCompareMode, isCompareA);
    updateState('isCompareA');
  };
  var onAddLayerCLick = function() {
    $('#layer-modal').dialog('open');
  };
  var toggleComparisonMode = function() {
    isCompareMode = !isCompareMode;
    if (!models.layers.activeA || !models.date.selectedA) {
      if (!models.date.selectedA) {
        models.date.initCompare();
      }
      if (!models.layers.activeA) {
        models.layers.initCompare();
      }
      updateState('layerObjects');
    }

    models.compare.toggle();
    models.date.activeDate = getActiveDateString(isCompareMode, isCompareA);
    updateState('isCompareMode');
  };
  var getActiveTabs = function() {
    const features = config.features;
    return {
      download: features.dataDownload,
      layers: true,
      events: features.naturalEvents != null
    };
  };
  var updateState = function(type) {
    switch (type) {
      case 'isCollapsed':
        return self.reactComponent.setState({ isCollapsed: isCollapsed });
      case 'activeTab':
        return self.reactComponent.setState({ activeTab: activeTab });
      case 'layers':
        return self.reactComponent.setState({
          layers: models.layers.get({ group: 'all' }, models.layers['active'])
        });
      case 'isCompareMode':
        return self.reactComponent.setState({ isCompareMode: isCompareMode });
      case 'isCompareA': {
        return self.reactComponent.setState({ isCompareA: isCompareA });
      }
      case 'layerObjects':
        compareObj = getCompareObjects(models);
        return self.reactComponent.setState({
          firstDateObject: compareObj.a,
          secondDateObject: compareObj.b
        });
    }
  };
  var toggleSidebar = function() {
    isCollapsed = !isCollapsed;
    updateState('isCollapsed');
  };
  var onTabClick = function(tab) {
    if (activeTab === tab) return;
    activeTab = tab;
    self.events.trigger('selectTab', tab);
    updateState('activeTab');
  };
  var updateLayer = function(layerId, typeOfUpdate) {
    var layer;
    var layerGroupString = getActiveLayerGroupString(isCompareMode, isCompareA);

    switch (typeOfUpdate) {
      case 'remove':
        models.layers.remove(layerId, layerGroupString);
        updateState(removeLayerState(layerGroupString));
        break;
      case 'add':
        models.layers.add(layerId, layerGroupString);
        break;
      case 'visibility':
        models.layers.toggleVisibility(layerId, layerGroupString);
        updateState(removeLayerState(layerGroupString));
        break;
      case 'info':
        layer = lodashFind(models.layers[layerGroupString], { id: layerId });
        layersInfo(config, models, layer);
        break;
      case 'options':
        layer = lodashFind(models.layers[layerGroupString], { id: layerId });
        layersOptions(config, models, layer);
        break;
      default:
        updateState(removeLayerState(layerGroupString));
    }
  };
  var removeLayerState = function(groupString) {
    return groupString === 'active' ? 'layers' : 'layerObjects';
  };
  var toggleLayerVisibility = function(layerId, isVisible) {
    var groupString = getActiveLayerGroupString(isCompareMode, isCompareA);
    models.layers.setVisibility(layerId, isVisible, groupString);
    if (groupString === 'active') {
      updateState('layers');
    } else {
      updateState('layerObjects');
    }
  };

  init();
  return self;
}
