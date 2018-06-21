import React from 'react';
import ReactDOM from 'react-dom';
import { TimelineDragger } from 'worldview-components';
import $ from 'jquery';
import lodashDebounce from 'lodash/debounce';
import util from '../util/util';

const DEBOUCE_TIME = 100;

export function timelineCompare(models, config, ui) {
  var self = {};
  var xmlns = 'http://www.w3.org/2000/svg';

  var timeline = ui.timeline;
  var $footer = $('#timeline-footer');
  var $header = $('#timeline-header');
  var $timeline = $('#timeline');
  var init = function() {
    var mountObjectA = document.createElementNS(xmlns, 'g');
    var mountObjectB = document.createElementNS(xmlns, 'g');
    var svg = document.getElementById('timeline-footer-svg');
    svg.appendChild(mountObjectA);
    svg.appendChild(mountObjectB);
    self.comparePickA = ReactDOM.render(
      React.createElement(TimelineDragger, getInitialProps('A')),
      mountObjectA
    );
    self.comparePickB = ReactDOM.render(
      React.createElement(TimelineDragger, getInitialProps('B')),
      mountObjectB
    );
  };
  var getInitialProps = function(compareLetter) {
    return {
      id: compareLetter,
      onDrag: lodashDebounce(onDrag, DEBOUCE_TIME),
      draggerID: 'compare-dragger-' + compareLetter,
      position: getLocationFromStringDate(
        models.date['selected' + compareLetter]
      )
    };
  };
  /*
   * calculates offset of timeline
   *
   * @method getHeaderOffset
   * @static
   *
   * @returns {number} OffsetX
   *
   */
  self.getHeaderOffset = function() {
    return (
      $header.width() +
      Number($timeline.css('left').replace('px', '')) +
      Number($footer.css('margin-left').replace('px', ''))
    );
  };
  var getLocationFromStringDate = function(date) {
    console.log(date, timeline.x(util.roundTimeTenMinute(date)));
    return timeline.x(util.roundTimeTenMinute(date));
  };
  /*
   * Handles click on widget:
   *  switches current date to
   *  date clicked
   *
   * @method onRangeClick
   * @static
   *
   * @param e {object} native event object
   *
   * @returns {object} props
   *
   */
  var onDrag = function(e, id) {
    var headerOffset = self.getHeaderOffset();
    var offsetX = e.pageX - headerOffset;
    var date = timeline.x.invert(offsetX);
    models.date.select(date, 'active' + id);
  };

  init();
  return self;
}
