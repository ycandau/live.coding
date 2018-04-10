/********************************************************************
 * An object to hold an int, float, word or string
 *
 * necessary because JS has no int and float types
 * cast_float is used to indicate an int cast to a float
 */
function Atom (type, value) {
  this.type = type
  this.value = value
}

const AT = {
  int:        1,
  float:      2,
  cast_float: 3,
  word:       4,
  string:     5
}

/**
 * Generate a string from an Atom
 */
Atom.prototype.toString = function () {
  switch (this.type) {
    case AT.int: return this.value.toString()
    case AT.float: return this.value.toString()
    case AT.cast_float: return this.value.toString() + '.'
    case AT.word: return this.value
    case AT.string: return `"${this.value}"`
    default: return '???'
  }
}

/**
 * Generate a type and string from an Atom
 */
Atom.prototype.toTypedString = function () {
  switch (this.type) {
    case AT.int: return 'int ' + this.value.toString()
    case AT.float: return 'float ' + this.value.toString()
    case AT.cast_float: return 'cast_float ' + this.value.toString() + '.'
    case AT.word: return 'sym ' + this.value
    case AT.string: return `sym "${this.value}"`
    default: return '???'
  }
}

/********************************************************************
 * A number of utility functions
 */

const Util = {}

/**
 * Get the first element of a collection
 */
Util.first = function (collection) {
  return [...collection][0]
}

/**
 * Get the last element of a collection
 */
Util.last = function (collection) {
  return [...collection].pop()
}

/**
 * Get an array of sub-arrays of subsequent elements
 */
Util.aperture = function (collection, cnt = 2) {
  const tmp = [...collection]
  const arr = []
  const limit = tmp.length - cnt + 1
  for (let i = 0; i < limit; i++) arr.push(tmp.slice(i, i + cnt))
  return arr
}

/**
 * Split a collection into subarrays, according to a condition on the elements
 */
Util.split = function (collection, condition) {
  const arr = []
  let sub = []
  for (let elem of collection) {
    if (condition(elem)) {
      arr.push(sub)
      sub = []
    }
    else sub.push(elem)
  }
  arr.push(sub)
  return arr
}
