/* global comm, TT, Util */

/********************************************************************
 * Represents a patchcord connection between two Max objects
 *
 * .id is used as a unique id for the connection
 */
function Connection (src_id, src_outlet, dest_id, dest_inlet) {
  this.src_id = src_id
  this.src_outlet = src_outlet
  this.dest_id = dest_id
  this.dest_inlet = dest_inlet
  this.id = `${src_id}|${src_outlet}-${dest_inlet}|${dest_id}`
}

Connection.prototype.toString = function () {
  return `${this.id}`
}

/********************************************************************
 * Represents a Max object
 */
function MaxObject (p) {
  this.id = p.obj_id
  this.class = p.obj_class
  this.args = [...p.obj_args]   // important to copy
  this.mess = [...p.obj_mess]
  this.inlet = p.obj_inlet
  this.in_propr = p.obj_in_prop
  this.outlet = p.obj_outlet
  this.out_propr = p.obj_out_prop
  this.is_conn_to_prev = p.is_conn_to_prev
  this.uses_jamoma = p.obj_uses_jamoma

  this.conn_in = new Set()
  this.conn_out = new Set()
  this.has_model = false
  this.has_view = false
  this.mvc_str = ''
}

const mop = MaxObject.prototype

/**
 * Set whether the object has a model or view active
 *
 * pass an object { model: true/false, view: true/false }
 */
mop.setMvc = function (state) {
  if (state.model !== undefined) this.has_model = state.model
  if (state.view !== undefined) this.has_view = state.view
  this.mvc_str = this.has_model
    ? this.has_view ? '-m/v' : '-m'
    : this.has_view ? '-v' : ''
}

/**
 * Get an object expression for the object
 *
 * Used to expand the object expressions in a command line
 */
mop.getObjExpr = function () {
  const conn_str = this.is_conn_to_prev ? '- ' : ''
  const args_str = this.args.length !== 0
    ? '(' + this.args.map(atom => atom.toString()).join(' ') + ')'
    : ''
  const io_str =
    (this.inlet_id === '' && this.outlet_id === '') ? ''
    : (this.outlet_id === '') ? ('.' + this.inlet_id)
    : ('.' + this.inlet_id + '.' + this.outlet_id)

  return `${conn_str}${this.class}:${this.id}${args_str}${io_str}`
}

/**
 * Generate a string from an object expression
 */
mop.toString = function () {
  return `${this.class}: ${this.id + this.mvc_str} (${this.args.join(' ')}) [${this.mess}] - [${[...this.conn_in].join(' ')}] >> [${[...this.conn_out].join(' ')}]`
}

/********************************************************************
 * Represents a graph of Max objects and connections
 *
 * .obj_by_classes duplicates some of the information to output
 *   a list of objects by class
 * .override is used to override checks such as adding an object
 *   that is already in the graph
 */
function Graph () {
  this.objects = new Map()
  this.connections = new Map()
  this.obj_by_classes = new Map()
  this.override = true
}

const gp = Graph.prototype

/**
 * Clear the graph
 */
gp.clear = function () {
  this.objects.clear()
  this.connections.clear()
  this.obj_by_classes.clear()
}

/**
 * Add an object to the graph
 *
 * For jamoma objects, this implies adding a model
 */
gp.addObject = function (obj, actions) {
  // For jamoma objects
  if (obj.uses_jamoma) {
    // If there is no such object in the graph yet
    if (!this.objects.has(obj.id)) {
      this.objects.set(obj.id, obj)
      obj.setMvc({ model: true })
      this.updateObjByClasses(obj)
      actions.push(['add', obj.class, obj.id])
    }
    else {
      // If there is no model of the object or override is on
      const graph_obj = this.objects.get(obj.id)
      if (!graph_obj.has_model || this.override) {
        graph_obj.setMvc({ model: true })
        this.updateObjByClasses(graph_obj)
        actions.push(['add', obj.class, obj.id])
      }
    }
  }
  else {
    if (!this.objects.has(obj.id)) {
      this.objects.set(obj.id, obj)
      this.updateObjByClasses(obj)
      actions.push(['add', obj.class, obj.id, ...obj.args.map(a => a.toTypedString())])
    }
    else if (this.override) {
      actions.push(['add', obj.class, obj.id, ...obj.args.map(a => a.toTypedString())])
    }
  }
}

/**
 * Add a view of an object to the graph
 *
 * This is only for jamoma objects
 */
gp.viewObject = function (obj, actions) {
  if (!obj.uses_jamoma) return

  if (!this.objects.has(obj.id)) {
    obj.setMvc({ view: true })
    this.objects.set(obj.id, obj)
    this.updateObjByClasses(obj)
    actions.push(['view', obj.class, obj.id])   // jamoma objects take no arguments
  }
  else {
    const graph_obj = this.objects.get(obj.id)
    if (!graph_obj.has_view) {
      graph_obj.setMvc({ view: true })
      this.updateObjByClasses(graph_obj)
      actions.push(['view', obj.class, obj.id])
    }
    else if (this.override) {
      actions.push(['view', obj.class, obj.id])
    }
  }
}

/**
 * Add a connection to the graph
 */
gp.addConnection = function (conn, actions) {
  if (!this.connections.has(conn.id) || this.override) {
    this.connections.set(conn.id, conn)
    this.objects.get(conn.src_id).conn_out.add(conn.id)
    this.objects.get(conn.dest_id).conn_in.add(conn.id)
    actions.push(['conn', conn.src_id, conn.src_outlet, conn.dest_id, conn.dest_inlet])
  }
}

/**
 * Delete an object in the graph_obj
 *
 * Also deletes all corresponding connections
 */
gp.delObject = function (obj, actions) {
  if (this.objects.has(obj.id)) {
    const graph_obj = this.objects.get(obj.id)

    graph_obj.conn_in.forEach(conn => this.connections.delete(conn))
    graph_obj.conn_in.clear()
    graph_obj.conn_out.forEach(conn => this.connections.delete(conn))
    graph_obj.conn_out.clear()

    if (graph_obj.uses_jamoma) {
      if (graph_obj.has_model || this.override) {
        graph_obj.setMvc({ model: false })
        this.updateObjByClasses(graph_obj)
        actions.push(['del', obj.class, obj.id])
      }
      if (!graph_obj.has_view) {
        this.objects.delete(graph_obj.id)
        this.delObjByClasses(graph_obj)
      }
    }
    else {
      this.objects.delete(graph_obj.id)
      this.delObjByClasses(graph_obj)
      actions.push(['del', obj.class, obj.id])
    }
  }
  else if (this.override) {
    actions.push(['del', obj.class, obj.id])
  }
}

/**
 * Delete a view of an object in the graph
 *
 * This is only for jamoma objects
 */
gp.delviewObject = function (obj, actions) {
  if (!obj.uses_jamoma) return

  if (this.objects.has(obj.id)) {
    const graph_obj = this.objects.get(obj.id)

    if (graph_obj.has_view || this.override) {
      graph_obj.setMvc({ view: false })
      this.updateObjByClasses(graph_obj)
      actions.push(['delview', obj.class, obj.id])
    }
    if (!graph_obj.has_model) {
      this.objects.delete(graph_obj.id)
      this.delObjByClasses(graph_obj)
    }
  }
  else if (this.override) {
    actions.push(['delview', obj.class, obj.id])
  }
}

/**
 * Delete a connection in the graph
 */
gp.delConnection = function (conn, actions) {
  if (this.connections.has(conn.id)) {
    this.connections.delete(conn.id)
    this.objects.get(conn.src_id).conn_out.delete(conn.id)
    this.objects.get(conn.dest_id).conn_in.delete(conn.id)
  }
  if (this.connections.has(conn.id) || this.override) {
    actions.push(['disc', conn.src_id, conn.src_outlet, conn.dest_id, conn.dest_inlet])
  }
}

/**
 * Schedule sending a message to an object
 */
gp.messObject = function (obj, actions) {
  if (!this.objects.has(obj.id) || this.override) {
    Util.split(obj.mess, elem => elem === TT.comma)
      .forEach(arr => {
        if (arr.length !== 0) {
          actions.push(['mess', obj.class, obj.id, ...arr.map(m => m.toTypedString())])
        }
      })
  }
}

/**
 * Update the map of objects by classes
 */
gp.updateObjByClasses = function (obj) {
  if (this.obj_by_classes.has(obj.class)) {
    this.obj_by_classes.get(obj.class).set(obj.id, obj.id + obj.mvc_str)
  }
  else {
    this.obj_by_classes.set(obj.class, new Map([[obj.id, obj.id + obj.mvc_str]]))
  }
}

/**
 * Delete an object in the map of objects by classes
 */
gp.delObjByClasses = function (obj) {
  if (this.obj_by_classes.has(obj.class)) {
    this.obj_by_classes.get(obj.class).delete(obj.id)
  }
}

/**
 * Add a graph to the main graph
 *
 * Called by the 'add' command
 */
gp.addGraph = function (graph, actions) {
  graph.objects.forEach(obj => this.addObject(obj, actions))
  graph.connections.forEach(conn => this.addConnection(conn, actions))
  graph.objects.forEach(obj => this.messObject(obj, actions))
}

/**
 * Delete a graph from the main graph
 *
 * Called by the 'del' command
 */
gp.delGraph = function (graph, actions) {
  graph.objects.forEach(obj => this.delObject(obj, actions))
}

/**
 * Add views in a graph to the main graph
 *
 * Called by the 'view' command
 */
gp.viewGraph = function (graph, actions) {
  graph.objects.forEach(obj => this.viewObject(obj, actions))
}

/**
 * Delete views in a graph from the main graph
 *
 * Called by the 'delview' command
 */
gp.delviewGraph = function (graph, actions) {
  graph.objects.forEach(obj => this.delviewObject(obj, actions))
}

/**
 * Disconnect connections in a graph from the main graph
 *
 * Called by the 'disc' command
 */
gp.discGraph = function (graph, actions) {
  graph.connections.forEach(conn => this.delConnection(conn, actions))
}

/**
 * Send all messages in a graph
 *
 * Called by the 'mess' command
 */
gp.messGraph = function (graph, actions) {
  graph.objects.forEach(obj => this.messObject(obj, actions))
}

/**
 * Get a string from a graph
 */
gp.toString = function (chain) {
  let str = `Graph:  ${this.objects.size} objects - ${this.connections.size} connections`
  str += [...this.objects.values()]
    .reduce((tmp, obj, ind) => tmp + `\n  O[${ind}]:  ${obj.toString()}`, '')
  str += [...this.connections.values()]
    .reduce((tmp, conn, ind) => tmp + `\n  C[${ind}]:  ${conn.toString()}`, '')
  return str
}

/**
 * Posting method
 */
gp.post = function (msg) {
  console.log(msg)
}

/**
 * Warning method
 */
gp.warn = function (msg) {
  this.post('Warning:  ' + msg)
}

/********************************************************************
 * An object to store and send all the actions to be processed
 */

function Actions () {
  this.actions = []
}

const ap = Actions.prototype

ap.push = function (action) {
  this.actions.push(action)
}

ap.clear = function () {
  this.actions.length = 0
}

ap.send = function () {
  this.actions.forEach(action => comm.send(action.join(' ')))
}
