import util from '../util/util';
import palettes from '../palettes/palettes';
import OlTileGridWMTS from 'ol/tilegrid/wmts';
import OlSourceWMTS from 'ol/source/wmts';
import OlSourceTileWMS from 'ol/source/tilewms';
import OlLayerGroup from 'ol/layer/group';
import OlLayerTile from 'ol/layer/tile';
import OlTileGridTileGrid from 'ol/tilegrid/tilegrid';
import Style from 'ol/style/style';
import Circle from 'ol/style/circle';
import Icon from 'ol/style/icon';
import Fill from 'ol/style/fill';
import MVT from 'ol/format/mvt';
import Stroke from 'ol/style/stroke';
import LayerVectorTile from 'ol/layer/vectortile';
import SourceVectorTile from 'ol/source/vectortile';
import lodashCloneDeep from 'lodash/cloneDeep';
import lodashMerge from 'lodash/merge';
import lodashEach from 'lodash/each';
import { lookupFactory } from '../ol/lookupimagetile';

export function mapLayerBuilder(models, config, cache, Parent) {
  var self = {};
  self.init = function (Parent) {
    self.extentLayers = [];
    Parent.events.on('selecting', hideWrap);
    Parent.events.on('selectiondone', showWrap);
  };
  /*
   * Create a new OpenLayers Layer
   *
   * @method createLayer
   * @static
   *
   * @param {object} def - Layer Specs
   *
   * @param {object} options - Layer options
   *
   *
   * @returns {object} OpenLayers layer
   */
  self.createLayer = function (def, options) {
    var date, key, proj, layer, layerNext, layerPrior, attributes;
    options = options || {};
    key = self.layerKey(def, options);
    proj = models.proj.selected;
    layer = cache.getItem(key);
    if (!layer) {
      date = options.date || models.date.selected;
      attributes = {
        id: def.id,
        key: key,
        date: util.toISOStringDate(date),
        proj: proj.id,
        def: def
      };
      def = lodashCloneDeep(def);
      lodashMerge(def, def.projections[proj.id]);
      if (def.type === 'wmts') {
        layer = createLayerWMTS(def, options);
        if (proj.id === 'geographic' && def.wrapadjacentdays === true) {
          layerNext = createLayerWMTS(def, options, 1);
          layerPrior = createLayerWMTS(def, options, -1);

          layer.wv = attributes;
          layerPrior.wv = attributes;
          layerNext.wv = attributes;

          layer = new OlLayerGroup({
            layers: [layer, layerNext, layerPrior]
          });
        }
      } else if (def.type === 'vector') {
        // Add vector layer style to config.rendered object
        var promises = [];
        if (config.layers[def.id] && config.layers[def.id].vectorStyle) {
          promises.push(palettes.loadRenderedVectorStyle(config, def.id));
        }

        layer = createLayerVector(def, options, null);
        if (proj.id === 'geographic' && def.wrapadjacentdays === true) {
          layerNext = createLayerVector(def, options, 1);
          layerPrior = createLayerVector(def, options, -1);

          layer.wv = attributes;
          layerPrior.wv = attributes;
          layerNext.wv = attributes;

          layer = new OlLayerGroup({
            layers: [layer, layerNext, layerPrior]
          });
        }
      } else if (def.type === 'wms') {
        layer = createLayerWMS(def, options);
        if (proj.id === 'geographic' && def.wrapadjacentdays === true) {
          layerNext = createLayerWMS(def, options, 1);
          layerPrior = createLayerWMS(def, options, -1);

          layer.wv = attributes;
          layerPrior.wv = attributes;
          layerNext.wv = attributes;

          layer = new OlLayerGroup({
            layers: [layer, layerNext, layerPrior]
          });
        }
      } else {
        throw new Error('Unknown layer type: ' + def.type);
      }
      layer.wv = attributes;
      cache.setItem(key, layer);
      layer.setVisible(false);
    }
    layer.setOpacity(def.opacity || 1.0);
    return layer;
  };
  /*
   * Create a layer key
   *
   * @function layerKey
   * @static
   *
   * @param {Object} def - Layer properties
   *
   * @param {number} options - Layer options
   *
   * @returns {object} layer key Object
   */
  self.layerKey = function (def, options) {
    var layerId = def.id;
    var projId = models.proj.selected.id;
    var date;
    if (options.date) {
      date = util.toISOStringDate(options.date);
    } else {
      date = util.toISOStringDate(models.date.selected);
    }
    var dateId = (def.period === 'daily') ? date : '';
    var palette = '';
    if (models.palettes.isActive(def.id)) {
      palette = models.palettes.key(def.id);
    }
    return [layerId, projId, dateId, palette].join(':');
  };
  /*
   * Create a new WMTS Layer
   *
   * @method createLayerWMTS
   * @static
   *
   * @param {object} def - Layer Specs
   *
   * @param {object} options - Layer options
   *
   *
   * @returns {object} OpenLayers WMTS layer
   */
  var createLayerWMTS = function (def, options, day) {
    var proj, source, matrixSet, matrixIds, urlParameters,
      date, extent, start;
    proj = models.proj.selected;
    source = config.sources[def.source];
    extent = proj.maxExtent;
    start = [proj.maxExtent[0], proj.maxExtent[3]];
    if (!source) {
      throw new Error(def.id + ': Invalid source: ' + def.source);
    }
    matrixSet = source.matrixSets[def.matrixSet];
    if (!matrixSet) {
      throw new Error(def.id + ': Undefined matrix set: ' + def.matrixSet);
    }
    if (typeof def.matrixIds === 'undefined') {
      matrixIds = [];
      lodashEach(matrixSet.resolutions, function (resolution, index) {
        matrixIds.push(index);
      });
    } else {
      matrixIds = def.matrixIds;
    }

    if (day) {
      if (day === 1) {
        extent = [-250, -90, -180, 90];
        start = [-540, 90];
      } else {
        extent = [180, -90, 250, 90];
        start = [180, 90];
      }
    }

    urlParameters = '?';
    if (def.period === 'daily') {
      date = options.date || models.date.selected;
      if (day) {
        date = util.dateAdd(date, 'day', day);
      }
      urlParameters = '&TIME=' + util.toISOStringDate(date);
    }
    var sourceOptions = {
      url: source.url + urlParameters,
      layer: def.layer || def.id,
      crossOrigin: 'anonymous',
      format: def.format,
      transition: 0,
      matrixSet: matrixSet.id,
      tileGrid: new OlTileGridWMTS({
        origin: start,
        resolutions: matrixSet.resolutions,
        matrixIds: matrixIds,
        tileSize: matrixSet.tileSize[0]
      }),
      wrapX: false,
      style: typeof def.style === 'undefined' ? 'default' : def.style
    };
    if (models.palettes.isActive(def.id)) {
      var lookup = models.palettes.getLookup(def.id);
      sourceOptions.tileClass = lookupFactory(lookup, sourceOptions);
    }
    var layer = new OlLayerTile({
      extent: extent,
      source: new OlSourceWMTS(sourceOptions)
    });

    return layer;
  };

  /*
   * Create a new Vector Layer
   *
   * @method createLayerVector
   * @static
   *
   * @param {object} def - Layer Specs
   *
   * @param {object} options - Layer options
   *
   *
   * @returns {object} OpenLayers Vector layer
   */
  var createLayerVector = function(def, options, day) {
    var date, urlParameters, proj, extent, source, matrixSet, matrixIds, start, renderColor;
    var styleCache = {};
    proj = models.proj.selected;
    source = config.sources[def.source];
    extent = proj.maxExtent;
    start = [proj.maxExtent[0], proj.maxExtent[3]];

    if (!source) { throw new Error(def.id + ': Invalid source: ' + def.source); }
    if (!source) {
      throw new Error(def.id + ': Invalid source: ' + def.source);
    }
    matrixSet = source.matrixSets[def.matrixSet];
    if (!matrixSet) {
      throw new Error(def.id + ': Undefined matrix set: ' + def.matrixSet);
    }
    if (typeof def.matrixIds === 'undefined') {
      matrixIds = [];
      lodashEach(matrixSet.resolutions, function(resolution, index) {
        matrixIds.push(index);
      });
    } else {
      matrixIds = def.matrixIds;
    }

    if (day) {
      if (day === 1) {
        extent = [-250, -90, -180, 90];
        start = [-540, 90];
      } else {
        extent = [180, -90, 250, 90];
        start = [180, 90];
      }
    }

    var layerName = def.layer || def.id;
    var tms = def.matrixSet;

    urlParameters = '?' +
    '&layer=' + layerName +
    '&tilematrixset=' + tms +
    '&Service=WMTS' +
    '&Request=GetTile' +
    '&Version=1.0.0' +
    '&FORMAT=application%2Fvnd.mapbox-vector-tile' +
    '&TileMatrix={z}&TileCol={x}&TileRow={y}';

    if (def.period === 'daily') {
      date = options.date || models.date.selected;
      if (day) {
        date = util.dateAdd(date, 'day', day);
      }
      urlParameters += '&TIME=' + util.toISOStringDate(date);
    }

    var sourceOptions = new SourceVectorTile({
      url: source.url + urlParameters,
      layer: layerName,
      crossOrigin: 'anonymous',
      format: new MVT(),
      matrixSet: tms,
      tileGrid: new OlTileGridTileGrid({
        extent: extent,
        origin: start,
        resolutions: matrixSet.resolutions,
        tileSize: matrixSet.tileSize
      })
    });

    // Create style options and store them in a styleCache Object
    // ref: http://openlayers.org/en/v3.10.1/examples/kml-earthquakes.html
    // ref: http://openlayersbook.github.io/ch06-styling-vector-layers/example-07.html
    var styleOptions = function(feature, resolution) {
      var fill, stroke, image, lowRange, highRange, operator, colorLow, colorMedium, colorHigh;
      var layerStyles = config.vectorStyles.rendered[def.id].styles;
      var styleGroup = Object.keys(layerStyles).map(e => layerStyles[e]);
      var matchedPropertyStyles = [];
      var matchedLineStyles = [];

      // Match JSON styles from GC to vector features
      lodashEach(styleGroup, function(styleValues, styleKeys) {
        var stylePropertyKey = styleValues.property;
        if (stylePropertyKey in feature.properties_) matchedPropertyStyles.push(styleValues);
        if (feature.type_ === 'LineString') matchedLineStyles.push(styleValues);
      });

      var featureStyle;
      lodashEach(matchedPropertyStyles, function(matchedStyle, matchedStyleKey) {
        var pointStyle = feature.get(matchedStyle.property);
        if (pointStyle) {
          featureStyle = styleCache[pointStyle];

          // Create range logic to dynamically style
          if (matchedStyle.range) {
            var ranges = matchedStyle.range.split(',');
            lowRange = ranges[ranges.length - 2];
            highRange = ranges[ranges.length - 1];
            if (matchedStyle.range.startsWith('[')) { operator = '>='; }
            if (matchedStyle.range.startsWith('(')) { operator = '>'; }
            if (matchedStyle.range.endsWith(']')) { operator = '<='; }
            if (matchedStyle.range.endsWith(')')) { operator = '<'; }
          }

          // Hard-coded logic to style based on range
          if (matchedStyle.range === '[0, 50)' && (feature.properties_[matchedStyle.property] >= 0 && feature.properties_[matchedStyle.property] < 50)) colorLow = matchedStyle.points.color;
          if (matchedStyle.range === '[50, 75)' && (feature.properties_[matchedStyle.property] >= 50 && feature.properties_[matchedStyle.property] < 75)) colorMedium = matchedStyle.points.color;
          if (matchedStyle.range === '[75, 100]' && (feature.properties_[matchedStyle.property] >= 75 && feature.properties_[matchedStyle.property] <= 100)) colorHigh = matchedStyle.points.color;
          if (colorLow) {
            if (!featureStyle) {
              fill = new Fill({
                color: colorLow || 'rgba(255,255,255,0.4)'
              });

              stroke = new Stroke({
                color: colorLow || '#3399CC',
                width: matchedStyle.points.width || 1.25
              });

              image = new Circle({
                fill: fill,
                stroke: stroke,
                radius: matchedStyle.points.radius || 5
              });

              featureStyle = new Style({
                fill: fill,
                stroke: stroke,
                image: image
              });
              styleCache[pointStyle] = featureStyle;
            }
          } else if (colorMedium) {
            if (!featureStyle) {
              fill = new Fill({
                color: colorMedium || 'rgba(255,255,255,0.4)'
              });

              stroke = new Stroke({
                color: colorMedium || '#3399CC',
                width: matchedStyle.points.width || 1.25
              });

              image = new Circle({
                fill: fill,
                stroke: stroke,
                radius: matchedStyle.points.radius || 5
              });

              featureStyle = new Style({
                fill: fill,
                stroke: stroke,
                image: image
              });
              styleCache[pointStyle] = featureStyle;
            }
          } else if (colorHigh) {
            if (!featureStyle) {
              fill = new Fill({
                color: colorHigh || 'rgba(255,255,255,0.4)'
              });

              stroke = new Stroke({
                color: colorHigh || '#3399CC',
                width: matchedStyle.points.width || 1.25
              });

              image = new Circle({
                fill: fill,
                stroke: stroke,
                radius: matchedStyle.points.radius || 5
              });

              featureStyle = new Style({
                fill: fill,
                stroke: stroke,
                image: image
              });
              styleCache[pointStyle] = featureStyle;
            }
          } else {
            if (!featureStyle) {
              fill = new Fill({
                color: 'rgba(255,255,255,0.4)'
              });

              stroke = new Stroke({
                color: '#3399CC',
                width: 1.25
              });

              image = new Circle({
                fill: fill,
                stroke: stroke,
                radius: 5
              });

              featureStyle = new Style({
                fill: fill,
                stroke: stroke,
                image: image
              });
              styleCache['defaultStyle'] = featureStyle;
            }
          }
        }
      });

      // Style lines are seperate as there are no featues to match it to.
      lodashEach(matchedLineStyles, function(matchedStyle, matchedStyleKey) {
        var lineStyle = feature.get('FID');
        if (lineStyle) {
          if (!featureStyle) {
            fill = new Fill({
              color: 'rgba(255,0,0,0.4)' || 'rgba(255,255,255,0.4)'
            });

            stroke = new Stroke({
              color: 'rgba(255,0,0,0.4)' || '#3399CC',
              width: 1.25
            });

            image = new Circle({
              fill: fill,
              stroke: stroke,
              radius: 5
            });

            featureStyle = new Style({
              fill: fill,
              stroke: stroke,
              image: image
            });
            styleCache[lineStyle] = featureStyle;
          }
        }
      });

      // The style for this feature style is in the cache, return it as an array
      return featureStyle;
    };

    var layer = new LayerVectorTile({
      renderMode: 'image',
      preload: 1,
      extent: extent,
      source: sourceOptions,
      style: styleOptions
    });

    return layer;
  };

  /*
   * Create a new WMS Layer
   *
   * @method createLayerWMTS
   * @static
   *
   * @param {object} def - Layer Specs
   *
   * @param {object} options - Layer options
   *
   *
   * @returns {object} OpenLayers WMS layer
   */
  var createLayerWMS = function (def, options, day) {
    var proj, source, urlParameters, transparent,
      date, extent, start, res, parameters;
    proj = models.proj.selected;
    source = config.sources[def.source];
    extent = proj.maxExtent;
    start = [proj.maxExtent[0], proj.maxExtent[3]];
    res = proj.resolutions;
    if (!source) { throw new Error(def.id + ': Invalid source: ' + def.source); }

    transparent = (def.format === 'image/png');
    if (proj.id === 'geographic') {
      res = [0.28125, 0.140625, 0.0703125, 0.03515625, 0.017578125, 0.0087890625, 0.00439453125,
        0.002197265625, 0.0010986328125, 0.00054931640625, 0.00027465820313];
    }
    if (day) {
      if (day === 1) {
        extent = [-250, -90, -180, 90];
        start = [-540, 90];
      } else {
        extent = [180, -90, 250, 90];
        start = [180, 90];
      }
    }
    parameters = {
      LAYERS: def.layer || def.id,
      FORMAT: def.format,
      TRANSPARENT: transparent,
      VERSION: '1.1.1'
    };
    if (def.styles) { parameters.STYLES = def.styles; }

    urlParameters = '?';

    if (def.period === 'daily') {
      date = options.date || models.date.selected;
      if (day) {
        date = util.dateAdd(date, 'day', day);
      }
      urlParameters += 'TIME=' + util.toISOStringDate(date);
    }
    var sourceOptions = {
      url: source.url + urlParameters,
      wrapX: true,
      style: 'default',
      crossOrigin: 'anonymous',
      params: parameters,
      transition: 0,
      tileGrid: new OlTileGridTileGrid({
        origin: start,
        resolutions: res
      })
    };

    if (models.palettes.isActive(def.id)) {
      var lookup = models.palettes.getLookup(def.id);
      sourceOptions.tileClass = lookupFactory(lookup, sourceOptions);
    }
    var layer = new OlLayerTile({
      extent: extent,
      source: new OlSourceTileWMS(sourceOptions)
    });
    return layer;
  };
  var hideWrap = function () {
    var layer;
    var key;
    var layers;

    layers = models.layers.active;

    for (var i = 0, len = layers.length; i < len; i++) {
      layer = layers[i];
      if (layer.wrapadjacentdays && layer.visible) {
        key = self.layerKey(layer, {
          date: models.date.selected
        });
        layer = cache.getItem(key);
        layer.setExtent([-180, -90, 180, 90]);
      }
    }
  };
  var showWrap = function () {
    var layer;
    var layers;
    var key;

    layers = models.layers.active;
    for (var i = 0, len = layers.length; i < len; i++) {
      layer = layers[i];
      if (layer.wrapadjacentdays && layer.visible) {
        key = self.layerKey(layer, {
          date: models.date.selected
        });
        layer = cache.getItem(key);
        layer.setExtent([-250, -90, 250, 90]);
      }
    }
  };
  self.init(Parent);
  return self;
};
