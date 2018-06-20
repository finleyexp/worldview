import util from '../util/util';
const DEFAULT_COMPARE_OBJ = {};
export function getCompareObjects(models) {
  if (!models.layers.activeA) return DEFAULT_COMPARE_OBJ;
  var obj = {};
  obj.a = {
    dateString: util.toISOStringDate(models.date.selectedA),
    layers: models.layers.get({ group: 'all' }, models.layers['activeA'])
  };
  obj.b = {
    dateString: util.toISOStringDate(models.date.selectedB),
    layers: models.layers.get({ group: 'all' }, models.layers['activeB'])
  };
  return obj;
}
export function getActiveLayerGroupString(abIsActive, isCompareA) {
  return !abIsActive ? 'active' : isCompareA ? 'activeA' : 'activeB';
}
export function getActiveDateString(abIsActive, isCompareA) {
  return !abIsActive ? 'selected' : isCompareA ? 'selectedA' : 'selectedB';
}
