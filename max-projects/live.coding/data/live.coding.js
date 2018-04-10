/* eslint no-global-assign: "off" */
/* eslint no-unused-vars: "off" */
/* global inlets, outlets, autowatch, post, error, max, arrayfromargs, messagename */
/* global Folder, Dict */

inlets = 1
outlets = 1
autowatch = 1

// Object used for the outlet indexes
var outl = {
  to_max: 0
}

// ========  VARIABLES  ========

var do_debug = true

var editor_name = 'live.editor.html'
var editor_relpath = '../../javascript/editor'   // from project

var host = 'localhost'
var port = 8082

var project_path = null

var info_dict = new Dict('test')

var root_patch = null
var models_patch = null
var views_patch = null
var models_pos = []
var views_pos = []

// ========  PATH OBJECT  ========

function Path () {
  this.valid = true
  this.path = this.patcherPath().toString()
}

var patch = this.patcher

Path.prototype.patcherPath = function () {
  // var patch = this.patcher
  var parent = patch
  while (parent.parentpatcher) parent = parent.parentpatcher
  this.path = parent.filepath.replace(/\/[\w ._-]*$/, '/')
  return this
}

Path.prototype.projectPath = function () {
  // var patch = this.patcher
  var parent = patch
  while (parent.parentpatcher) parent = parent.parentpatcher
  this.path = parent.filepath.replace(/\/patchers\/[\w ._-]*$/, '/')
  return this
}

Path.prototype.cdParent = function () {
  this.path = this.path.replace(/\/[\w ._-]+\/$/, '/')
  return this
}

Path.prototype.cdChild = function (folder) {
  var test_folder = new Folder(this.path)
  test_folder.typelist = ['fold']
  test_folder.next()
  while (!test_folder.end && folder !== test_folder.filename) test_folder.next()
  if (folder === test_folder.filename) this.path = this.path + folder + '/'
  else {
    error('Path.cd:  no subfolder \'' + folder + '\' in \'' + this.path + '\'\n')
    this.valid = false
  }
  test_folder.close()
  return this
}

Path.prototype.cd = function (rel_path) {
  var that = this
  rel_path.split('/').forEach(function (folder) {
    switch (folder) {
      case '.': break
      case '..': that.cdParent(); break
      default: that.cdChild(folder); break
    }
  })
  return this
}

Path.prototype.toString = function () {
  return this.path
}

Path.prototype.post = function () {
  post(this.path + '\n')
  return this
}

// ========  INTERFACE FUNCTIONS  ========
function init_ws () {

}

function init () {
  info_dict.import_json('live.coding.json')
  /* info_dict.replace('websocket::host', host)
  info_dict.replace('websocket::port', port)
  info_dict.export_json(project_path + 'code/live.coding.json') */

  root_patch = this.patcher.parentpatcher
  models_patch = root_patch.getnamed('models').subpatcher()
  views_patch = root_patch.getnamed('views').subpatcher()
  models_patch.apply(function (obj) {
    models_patch.remove(obj)
  })
  views_patch.apply(function (obj) {
    views_patch.remove(obj)
  })

  models_pos = [15, 15]
  views_pos = [15, 15]
}
init()

function open_editor () {
  var editor_path = new Path().projectPath().cd(editor_relpath)
  if (editor_path.valid) max.launchbrowser(editor_path + editor_name)
}

function add (cl, id) {
  var args = arrayfromargs(arguments).slice(2)
  post('adding:  ' + cl + ': ' + id + ' (' + args.join(', ') + ')' + '\n')
  if (models_patch.getnamed(id) !== null) {
    return error('add:  object ' + id + ' already exists\n')
  }

  var typed_args = []
  for (var i = 0; i < args.length / 2; i++) {
    switch (args[2 * i]) {
      case 'int': typed_args.push(args[2 * i + 1]); break
      case 'float': typed_args.push(args[2 * i + 1]); break
      case 'cast_float': typed_args.push((args[2 * i + 1]).toString() + '.'); break
      case 'sym': typed_args.push(args[2 * i + 1]); break
      default: error('invalid argument type \'' + args[2 * i] + '\'\n')
    }
  }

  var class_dict = info_dict.get('classes::' + cl)
  var types = toArray(class_dict.get('type'))
  var obj = null

  switch (types[0]) {
    case 'minim':
      obj = models_patch.newdefault(models_pos[0], models_pos[1],
        'minim.' + class_dict.get('patcher') + '.model', id)
      break
    case 'jamoma':
      obj = models_patch.newdefault(models_pos[0], models_pos[1],
        class_dict.get('patcher') + '.model', id)
      break
    case 'internal':
      obj = models_patch.newdefault(models_pos[0], models_pos[1], cl, typed_args)
      break
    case 'maxobj':
      obj = models_patch.newdefault(models_pos[0], models_pos[1], typed_args)
      break
    default: return error('add:  invalid type: ' + types[0] + '\n')
  }

  models_patch.bringtofront(obj)
  obj.varname = id
  models_pos[0] += 15
  models_pos[1] += 30
}

function view (cl, id) {
  post('viewing:  ' + cl + ': ' + id + '\n')
  if (views_patch.getnamed(id) !== null) {
    return error('view:  object ' + id + ' already exists')
  }

  var class_dict = info_dict.get('classes::' + cl)
  var types = toArray(class_dict.get('type'))
  var obj = null

  switch (types[0]) {
    case 'minim':
      obj = views_patch.newdefault(views_pos[0], views_pos[1],
        'bpatcher', 'minim.' + class_dict.get('patcher') + '.view', '@args', id)
      break
    case 'jamoma':
      obj = views_patch.newdefault(views_pos[0], views_pos[1],
        'bpatcher', class_dict.get('patcher') + '.view', '@args', id)
      break
    case 'internal':
    case 'maxobj':
      return error('view:  internal and maxobj objects have no view\n')
    default: return error('view:  invalid type: ' + types[0] + '\n')
  }

  views_patch.bringtofront(obj)
  obj.varname = id + '[0]'
  views_pos[0] += 30
  views_pos[1] += 60
}

function del (cl, id) {
  post('deleting:  ' + cl + ' - ' + id + '\n')

  var obj = models_patch.getnamed(id)
  models_patch.remove(obj)
}

function delview (cl, id) {
  post('deleting view:  ' + cl + ' - ' + id + '\n')

  var obj = views_patch.getnamed(id + '[0]')
  views_patch.remove(obj)
}

function conn (src_id, src_outlet, dest_id, dest_inlet) {
  post('connecting:  ' + src_id + ' | ' + src_outlet + ' -- ' +
    dest_inlet + ' | ' + dest_id + '\n')

  models_patch.connect(
    models_patch.getnamed(src_id), src_outlet,
    models_patch.getnamed(dest_id), dest_inlet)
}

function disc (src_id, src_outlet, dest_id, dest_inlet) {
  post('disconnecting:  ' + src_id + ' | ' + src_outlet + ' -- ' +
    dest_inlet + ' | ' + dest_id + '\n')

  models_patch.disconnect(
    models_patch.getnamed(src_id), src_outlet,
    models_patch.getnamed(dest_id), dest_inlet)
}

function mess (cl, id) {
  var args = arrayfromargs(arguments).slice(2)
  post('messaging:  ' + cl + ': ' + id + ' (' + args.join(', ') + ')' + '\n')
  if (models_patch.getnamed(id) === null) {
    return error('mess:  object ' + id + ' does not exist\n')
  }

  var typed_args = []
  for (var i = 0; i < args.length / 2; i++) {
    switch (args[2 * i]) {
      case 'int': typed_args.push(args[2 * i + 1]); break
      case 'float': typed_args.push(args[2 * i + 1]); break
      case 'cast_float': typed_args.push((args[2 * i + 1]).toString() + '.'); break
      case 'sym': typed_args.push(args[2 * i + 1]); break
      default: error('invalid argument type \'' + args[2 * i] + '\'\n')
    }
  }

  var obj = models_patch.getnamed(id)
  obj.message(typed_args)
}

function audio (on_off) {
  root_patch.getnamed('ezdac').message(on_off === 'on' ? 1 : 0)
}

function to_max () {
  post('ws to max: ' + arrayfromargs(arguments).join(' ') + '\n')
}

function anything () {
  post('ws to js: ' + arrayfromargs(messagename, arguments).join(' ') + '\n')
}

function toArray (arr) {
  if (arr === undefined || arr === null) return []
  else if (typeof arr === 'string') return [arr]
  else return arr
}

function bang () {

}
