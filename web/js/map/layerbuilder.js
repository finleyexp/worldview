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
import Text from 'ol/style/text';
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
    date = self.closestDate(def, options);
    key = self.layerKey(def, options, date);
    proj = models.proj.selected;
    layer = cache.getItem(key);
    if (!layer) { // layer is not in the cache
      if (!date) date = options.date || models.date.selected;
      attributes = {
        id: def.id,
        key: key,
        date: date,
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

  /**
   * Returns the closest date, from the layer's array of availableDates
   *
   * @param  {object} def     Layer definition
   * @param  {object} options Layer options
   * @return {object}         Closest date
   */
  self.closestDate = function (def, options) {
    var date;
    var animRange;
    if (models.anim) { animRange = models.anim.rangeState; }
    var dateArray = def.availableDates || [];
    if (options.date) {
      date = options.date;
    } else {
      date = models.date.selected;
    }
    // Perform extensive checks before finding closest date
    if (!options.precache && (animRange && animRange.playing === false) &&
        ((def.period === 'daily' && (models.date.selectedZoom > 3)) ||
        (def.period === 'monthly' && (models.date.selectedZoom >= 2)) ||
        (def.period === 'yearly' && (models.date.selectedZoom >= 1)))) {
      date = util.prevDateInDateRange(def, date, dateArray);

      // Is current "rounded" previous date not in array of availableDates
      if (date && !dateArray.includes(date)) {
        // Then, update layer object with new array of dates
        def.availableDates = util.datesinDateRanges(def, date, true);
        date = util.prevDateInDateRange(def, date, dateArray);
      }
    }
    return date;
  };

  /*
   * Create a layer key
   *
   * @function layerKey
   * @static
   *
   * @param {Object} def - Layer properties
   * @param {number} options - Layer options
   * @param {boolean} precache
   *
   * @returns {object} layer key Object
   */
  self.layerKey = function (def, options) {
    var date;
    var layerId = def.id;
    var projId = models.proj.selected.id;
    var palette = '';

    if (options.date) {
      date = options.date;
    } else {
      date = models.date.selected;
    }
    date = self.closestDate(def, options);

    if (models.palettes.isActive(def.id)) {
      palette = models.palettes.key(def.id);
    }
    return [layerId, projId, date, palette].join(':');
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
      cacheSize: 4096,
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
      preload: Infinity,
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
    var date, styleOptions, urlParameters, proj, extent, source, matrixSet, matrixIds, start;
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
    var featureStyles = function(feature, resolution) {
      var featureStyle, color, width, radius, fill, stroke, image, text, label, labelFillColor, labelStrokeColor;
      var layerStyles = config.vectorStyles.rendered[def.id].styles;
      var styleGroup = Object.keys(layerStyles).map(e => layerStyles[e]);
      var styleGroupCount = 0;
      var matchedPropertyStyles = [];
      var matchedLineStyles = [];

      // Match JSON styles from GC to vector features and add styleValue to arrays
      lodashEach(styleGroup, function(styleValues) {
        let stylePropertyKey = styleValues.property;
        if (stylePropertyKey in feature.properties_) matchedPropertyStyles.push(styleValues);
        if (feature.type_ === 'LineString' && styleValues.lines) matchedLineStyles.push(styleValues);
      });

      // Style vector points
      lodashEach(matchedPropertyStyles, function(matchedStyle) {
        styleGroupCount++;
        let pointStyle = feature.get(matchedStyle.property) + '_' + styleGroupCount;
        if (pointStyle) {
          featureStyle = styleCache[pointStyle];

          // If there is a range, style properties based on ranges
          if (matchedStyle.range) {
            let ranges = matchedStyle.range.split(',');
            let lowRange = ranges[ranges.length - 2].substring(1).trim();
            let highRange = ranges[ranges.length - 1].slice(0, -1).trim();
            if (matchedStyle.range.startsWith('[') && matchedStyle.range.endsWith(']')) { // greater than or equal to + less than or equal to
              if (feature.properties_[matchedStyle.property] >= lowRange && feature.properties_[matchedStyle.property] <= highRange) {
                color = matchedStyle.points.color;
              }
            } else if (matchedStyle.range.startsWith('[') && matchedStyle.range.endsWith(')')) { // greater than or equal to + less than
              if (feature.properties_[matchedStyle.property] >= lowRange && feature.properties_[matchedStyle.property] < highRange) {
                color = matchedStyle.points.color;
              }
            } else if (matchedStyle.range.startsWith('(') && matchedStyle.range.endsWith(']')) { // greater than + less than or equal to
              if (feature.properties_[matchedStyle.property] > lowRange && feature.properties_[matchedStyle.property] <= highRange) {
                color = matchedStyle.points.color;
              }
            } else if (matchedStyle.range.startsWith('(') && matchedStyle.range.endsWith(')')) { // greater than + less than
              if (feature.properties_[matchedStyle.property] > lowRange && feature.properties_[matchedStyle.property] < highRange) {
                color = matchedStyle.points.color;
              }
            } else {
              color = matchedStyle.points.color;
            }
          } else if (feature.properties_.time && matchedStyle.property === 'time' && matchedStyle.regex) {
            //  If there is a regexp and time property, style time vector points
            let time = feature.properties_.time;
            let pattern = new RegExp(matchedStyle.regex);
            let timeTest = pattern.test(time);
            if (timeTest) {
              color = matchedStyle.points.color;
              radius = matchedStyle.points.radius;
              if (matchedStyle.label) {
                label = feature.properties_.time;
                labelFillColor = matchedStyle.label.fill_color;
                labelStrokeColor = matchedStyle.label.stroke_color;
              }
            }
          } else {
            // Else set default styles
            color = matchedStyle.points.color;
            radius = matchedStyle.points.radius;
            width = matchedStyle.points.width;
          }

          if (!featureStyle) {
            fill = new Fill({
              color: color || 'rgba(255, 255, 255, 0.4)'
            });

            stroke = new Stroke({
              color: color || 'rgb(51, 153, 204, 1)',
              width: width || 1.25
            });

            image = new Circle({
              fill: fill,
              stroke: stroke,
              radius: radius || 5
            });

            text = new Text({
              text: label || '',
              fill: new Fill({
                color: labelFillColor || 'rgba(255, 255, 255, 1)'
              }),
              stroke: new Stroke({
                color: labelStrokeColor || 'rgba(255, 255, 255, 1)'
              }),
              font: '9px sans-serif',
              offsetX: 24
            });

            featureStyle = new Style({
              fill: fill,
              stroke: stroke,
              image: image,
              text: text
            });
            styleCache[pointStyle] = featureStyle;
          }
        }
      });

      // Style vector lines
      lodashEach(matchedLineStyles, function(matchedStyle) {
        let lineStyle = feature.type;
        let lineColor = matchedStyle.lines.color;
        let lineWidth = matchedStyle.lines.width;

        if (!featureStyle) {
          featureStyle = new Style({
            stroke: new Stroke({
              color: lineColor || '#3399CC',
              width: lineWidth || 1.25
            })
          });
          styleCache[lineStyle] = featureStyle;
        }
      });
      // The style for this feature is in the cache. Return it as an array
      return featureStyle;
    };

    var defaultFill = new Fill({
      color: 'rgba(255,255,255,0.4)'
    });
    var deafultStroke = new Stroke({
      color: '#3399CC',
      width: 1.25
    });
    var defaultStyles = [
      new Style({
        image: new Circle({
          fill: defaultFill,
          stroke: deafultStroke,
          radius: 5
        }),
        fill: defaultFill,
        stroke: deafultStroke
      })
    ];

    if (!config.vectorStyles.rendered[def.id]) {
      styleOptions = defaultStyles;
    } else {
      styleOptions = featureStyles;
    }

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
      cacheSize: 4096,
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
      preload: Infinity,
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
