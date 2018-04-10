// ================  CONST  ================

/* global Atom, AT, Connection, MaxObject, Graph, Actions, XMLHttpRequest, Util */
/* global comm, editor, info */

const dbParser = 1
const traceParser = false

const CONTEXT = {
  regular:  1,
  args:     2,
  messages: 3,
  list:     4
}

function Token (label, options = {}) {
  this.label = label
  ;[...Object.entries(options)].forEach(([key, val]) => { this[key] = val })
}

const commands = new Set()
const ttFromLabel = new Map()

function newTokenType (label, options = {}) {
  const tok_type = new Token(label, options)
  ttFromLabel.set(label, tok_type)
  return tok_type
}

function newCommand (label, options = {}) {
  options.is_command = true
  const tok_type = new Token(label, options)
  commands.add(label)
  ttFromLabel.set(label, tok_type)
  return tok_type
}

const listCommandOptions = {
  type:    'list',
  context: CONTEXT.list
}

const TT = {
  add:     newCommand('add', { type: 'graph' }),
  del:     newCommand('del', { type: 'graph' }),
  disc:    newCommand('disc', { type: 'graph' }),
  view:    newCommand('view', { type: 'graph' }),
  delview: newCommand('delview', { type: 'graph' }),
  mess:    newCommand('mess', { type: 'graph' }),

  js:    newCommand('js', listCommandOptions),
  list:  newCommand('list', listCommandOptions),
  audio: newCommand('audio', { ...listCommandOptions,
    valid: (list) => (list.length === 1) && ['on', 'off'].includes(list[0])
  }),

  class:      newTokenType('class'),
  word:       newTokenType('word'),
  string:     newTokenType('string'),
  int:        newTokenType('int'),
  float:      newTokenType('float'),
  cast_float: newTokenType('cast_float'),
  eol:        newTokenType('eol'),

  space:       newTokenType(' '),
  exclamation: newTokenType('!'),
  dbl_quote:   newTokenType('"'),
  number:      newTokenType('#'),
  dollar:      newTokenType('$'),
  percent:     newTokenType('%'),
  ampersand:   newTokenType('&'),
  sgl_quote:   newTokenType('\''),
  paren_l:     newTokenType('('),
  paren_r:     newTokenType(')'),
  asterisk:    newTokenType('*'),
  plus:        newTokenType('+'),
  comma:       newTokenType(','),
  hyphen:      newTokenType('-'),
  period:      newTokenType('.'),
  slash:       newTokenType('/'),
  colon:       newTokenType(':'),
  semicolon:   newTokenType(';'),
  less:        newTokenType('<'),
  equal:       newTokenType('='),
  greater:     newTokenType('>'),
  question:    newTokenType('?'),
  at:          newTokenType('@'),
  bracket_l:   newTokenType('['),
  backslash:   newTokenType('\\'),
  bracket_r:   newTokenType(']'),
  caret:       newTokenType('^'),
  underscore:  newTokenType('_'),
  grave:       newTokenType('`'),
  curly_l:     newTokenType('{'),
  bar:         newTokenType('|'),
  curly_r:     newTokenType('}'),
  tilde:       newTokenType('~')
}

const IO = {
  inlet:    'inlet',
  outlet:   'outlet',
  all_inl:  'inlet*',
  all_outl: 'outlet*'
}

const PREV = 1

// ================  PARSE OBJECT  ================

function Parser () {
  this.json = null           // to load the JSON file into
  this.classes = new Set()   // all the classes, from JSON file
  this.types = new Set()
  this.props = new Set()
  this.commands = commands   // Set filled by newCommand()

  this.graph = new Graph()      // graph with all objects and connections
  this.st_graph = new Graph()   // temporary graph per statement
  this.actions = new Actions()  // to store actions
  this.st_list = []
  this.obj_args = []
  this.obj_mess = []

  this.loadJson()
}

const pp = Parser.prototype

// ================  LOAD JSON  ================

// Load JSON file with info on all classes

pp.loadJson = function () {
  const xobj = new XMLHttpRequest()
  xobj.overrideMimeType('application/json')
  xobj.open('GET', 'live.coding.json', true)

  xobj.onreadystatechange = () => {
    if (xobj.readyState === 4 && xobj.status === 200) {
      this.json = JSON.parse(xobj.responseText)
      this.processJson()
    }
  }
  xobj.send(null)
}

pp.processJson = function () {
  if (this.json === undefined) this.post('Error: Dictionary undefined')
  Object.entries(this.json.classes).forEach(([cl, info]) => {
    // A class name cannot be a command
    if (this.commands.has(cl)) {
      const msg = `Invalid class name '${cl}' is already used as a command. Revise the 'live.coding.json' file.`
      this.post('Error: ' + msg)
      throw new SyntaxError(msg)
    }
    this.classes.add(cl)
    this.types.add(info.type)
    if (info.props) info.props.forEach(elem => this.props.add(elem))
  })
}

// ================  TEST  ================

pp.test = function (input, line) {

}

// ================  PARSE  ================

pp.parseLine = function (input, line) {
  this.trace('parseLine')
  this.initLine(input, line)
  this.readLine()
  this.finishLine()
}

pp.initLine = function (input, line) {
  this.input = input
  this.line = line
  this.pos = -1
  this.ch = ''
  this.ch_code = null
  this.prev_ch_code = null
  this.context = CONTEXT.regular
  this.tok_type = null
  this.tok_value = null
  this.tok_begin = this.pos
  this.nextChar()
  this.nextToken()
}

pp.readLine = function () {
  if (this.tok_type === TT.eol) return
  this.parseStatement()
}

pp.finishLine = function () {
}

pp.parseStatement = function () {
  this.trace('parseStatement')
  this.initStatement()
  this.readStatement()
  this.finishStatement()
}

pp.initStatement = function () {
  this.st_graph.clear()
  this.actions.clear()
  this.st_list.length = 0
  this.st_command = null
  this.is_conn_to_prev = false
  this.expr = -1
}

pp.readStatement = function () {
  this.readCommand()

  switch (this.st_command) {
    case TT.js: case TT.audio: case TT.list:
      this.readList(this.st_command)
      break
    case TT.add: case TT.del: case TT.disc: case TT.view: case TT.delview: case TT.mess:
      this.readChain()
      break
    default: this.throw('BUG: readStatement: invalid command token')
  }
  this.expect(TT.eol, 'BUG: readStatement: \'eol\' expected')
}

pp.finishStatement = function (input, line) {
  switch (this.st_command.type) {
    case 'graph':
      this.processConnections()
      this.processCommand()
      this.updateLine()
      this.updateObjList()
      this.actions.send()
      this.db(1, this.graph.toString())
      break
    case 'list':
      this.processCommand()
      break
  }
}

pp.readCommand = function () {
  this.trace('readCommand')
  if (this.tok_type.is_command) {
    this.st_command = this.tok_type
    if (this.st_command.context) this.context = this.st_command.context
    this.nextToken()
  }
  else {
    this.st_command = TT.mess
  }
}

pp.readList = function (tt) {
  this.trace('readList')
  while (this.tok_type !== TT.eol) {
    this.st_list.push(this.tok_value)
    this.nextToken()
  }
  if (this.st_command.valid && !this.st_command.valid(this.st_list)) {
    this.throw(`invalid arguments for command '${this.st_command.label}'`, PREV)
  }
}

pp.readChain = function () {
  this.parseObjExpr()
  while (this.tok_type !== TT.eol) {
    switch (this.tok_type) {
      case TT.hyphen:
        this.read(TT.hyphen)
        this.is_conn_to_prev = true
        this.parseObjExpr()
        break
      case TT.class: case TT.word: this.parseObjExpr(); break
      case TT.eol: return
      default: this.throw('invalid token in chain of object expressions')
    }
  }
}

pp.parseObjExpr = function () {
  this.trace('parseObjExpr')
  this.initObjExpr()
  this.readObjExpr()
  this.finishObjExpr()
}

pp.initObjExpr = function () {
  this.expr++
  this.obj_class = null
  this.obj_id = null
  this.obj_inlet = null
  this.obj_in_prop = null
  this.obj_outlet = null
  this.obj_out_prop = null
  this.obj_args.length = 0
  this.obj_mess.length = 0
  this.found_args = false
  this.found_mess = false
}

pp.readObjExpr = function () {
  switch (this.tok_type) {
    case TT.class:
      this.obj_class = this.tok_value
      this.nextToken()
      this.getNewObjId()
      break
    case TT.word:
      this.readObjId()
      break
    default: this.throw('no class or object id introducing the object expression')
  }

  while (true) {
    switch (this.tok_type) {
      case TT.paren_l: this.readArgs(); break
      case TT.bracket_l: this.readMessages(); break
      case TT.period: this.readIOlet(); break
      case TT.class: case TT.word: case TT.hyphen: case TT.eol: return
      default: this.throw('invalid token in object expression')
    }
  }
}

pp.finishObjExpr = function () {
  const class_info = this.json.classes[this.obj_class]

  // Set whether the object uses jamoma and clip the arguments if necessary
  switch (class_info.type) {
    case 'minim': case 'jamoma':
      this.obj_uses_jamoma = true
      this.obj_args.length = 0
      break
    case 'internal': case 'maxobj':
      this.obj_uses_jamoma = false
      if ((class_info.maxargs !== undefined) && (class_info.maxargs !== 'unknown')) {
        this.obj_args = this.obj_args.slice(0, class_info.maxargs)
      }
      break
  }

  // Get default inlet / outlet values if necessary
  if (this.obj_inlet === null) this.setDefIO('inlet')
  if (this.obj_outlet === null) this.setDefIO('outlet')

  // Create the object
  this.st_graph.objects.set(this.obj_id, new MaxObject(this))

  // Reset the connection status
  this.is_conn_to_prev = false
}

pp.getNewObjId = function () {
  this.trace('getNewObjId')
  if (this.read(TT.colon)) this.readNewObjId()
  else this.getAutoObjId()
}

pp.readNewObjId = function () {
  switch (this.tok_type) {
    case TT.int:
      this.obj_id = this.obj_class + this.tok_value
      break
    case TT.word:
      this.obj_id = (this.tok_value.length === 1)
        ? this.obj_class + this.tok_value
        : this.tok_value
      break
    case TT.class:
      this.throw('object id cannot be a class name')
      break
    default:
      if (TT.is_command) this.throw('object id cannot be a command')
      else this.throw('object id expected after colon')
  }
  this.nextToken()
}

pp.getAutoObjId = function () {
  let id
  let i = 0

  do {
    id = this.obj_class + i.toString()
    i++
  }
  while (this.graph.objects.has(id) || this.st_graph.objects.has(id) ||
    this.classes.has(id) || this.commands.has(id))
  this.obj_id = id
}

pp.readObjId = function () {
  this.trace('readObjId')
  const obj = this.graph.objects.get(this.tok_value) ||
    this.graph.objects.get(this.tok_value)

  if (obj === undefined) this.throw('invalid command or undefined object id')
  this.obj_class = obj.class
  this.obj_id = this.tok_value
  this.nextToken()
}

pp.readArgs = function () {
  this.trace('readArgs')
  this.context = CONTEXT.args
  this.expect(TT.paren_l)
  if (this.found_args) this.warn('more than one set of args', PREV)

  do {
    switch (this.tok_type) {
      case TT.comma: case TT.colon: case TT.semicolon:
        break

      case TT.int: case TT.float: case TT.cast_float: case TT.word: case TT.string:
        this.obj_args.push(new Atom(AT[this.tok_type.label], this.tok_value))
        break

      case TT.paren_r:
        this.context = CONTEXT.regular
        this.found_args = true
        this.nextToken()
        return

      default: this.throw('invalid argument or missing \')\'')
    }
    this.nextToken()
  } while (true)
}

pp.readMessages = function () {
  this.trace('readMessages')
  this.context = CONTEXT.messages
  this.expect(TT.bracket_l)
  if (this.found_mess) this.warn('more than one set of messages', PREV)

  do {
    switch (this.tok_type) {
      case TT.colon:
        break

      case TT.comma: case TT.semicolon:
        this.obj_mess.push(TT.comma)
        break

      case TT.int: case TT.float: case TT.cast_float: case TT.word: case TT.string:
        this.obj_mess.push(new Atom(AT[this.tok_type.label], this.tok_value))
        break

      case TT.bracket_r:
        this.context = CONTEXT.regular
        this.found_mess = true
        this.nextToken()
        return

      default: this.throw('invalid message or missing \']\'')
    }
    this.nextToken()
  } while (true)
}

pp.readIOlet = function () {
  this.trace('readIOlet')
  this.expect(TT.period)

  let io_type
  if (this.obj_inlet === null) io_type = IO.inlet
  else if (this.obj_outlet === null) io_type = IO.outlet
  else this.throw('inlet and outlet already defined', PREV)

  switch (this.tok_type) {
    case TT.int: this.tryIntIO(io_type); return
    case TT.word: this.tryIdIO(io_type); return
    default: this.setDefIO(io_type)
  }
}

pp.tryIntIO = function (io_type) {
  const max_ind = this.json.classes[this.obj_class][io_type + '_cnt']
  if ((this.tok_value >= 0) && ((this.tok_value < max_ind) || (max_ind === 'unknown'))) {
    this['obj_' + io_type] = this.tok_value
  }
  else {
    this.throw(io_type + ' value out of range')
  }
  this.nextToken()
}

pp.tryIdIO = function (io_type) {
  const ids = this.json.classes[this.obj_class][io_type + '_ids']
  const matches = ids.filter(elem => elem.indexOf(this.tok_value) === 0)

  switch (matches.length) {
    case 1: this['obj_' + io_type] = ids.indexOf(matches[0]); break
    case 0: this.throw('invalid ' + io_type + ' id'); break
    default: this.throw(`ambiguous ${io_type} id '${this.tok_value}' matches [${matches.join(', ')}]`)
  }
  this.nextToken()
}

pp.setDefIO = function (io_type) {
  this['obj_' + io_type] = this.json.classes[this.obj_class][io_type + '_def']
}

// ================  UTIL  ================

function isDigit (code) {
  if (code < 48) return false
  if (code < 58) return true          // 48-57: digits
  return false
}

// Test whether a given character code starts an identifier

function isWordStart (code) {
  if (code < 65) return false
  if (code < 91) return true          // 65-90: uppercase
  if (code < 97) return code === 95   // 95: underscore
  if (code < 123) return true         // 97-122: lowercase
  return false
}

// Test whether a given character is part of an identifier

function isWordChar (code) {
  if (code < 48) return false
  if (code < 58) return true          // 48-57: digits
  if (code < 65) return false
  if (code < 91) return true          // 65-90: uppercase
  if (code < 97) return code === 95   // 95: underscore
  if (code < 123) return true         // 97-122: lowercase
  return false
}

function isSpecialChar (code) {
  if (code < 32) return false
  if (code < 48) return true
  if (code < 58) return false
  if (code < 65) return true
  if (code < 91) return false
  if (code < 97) return true
  if (code < 123) return false
  if (code < 127) return true
  return false
}

function isNotControl (code) {
  if (code < 32) return false
  if (code < 127) return true
  return false
}

function charType (code) {
  if (code < 32) return false
  if (code < 48) return true
  if (code < 58) return false
  if (code < 65) return true
  if (code < 91) return false
  if (code < 97) return true
  if (code < 123) return false
  if (code < 127) return true
  return false
}

// ================  TOKENIZE  ================

pp.nextChar = function () {
  this.prev_ch_code = this.ch_code
  this.pos++
  this.ch = this.input.charAt(this.pos)
  this.ch_code = this.input.charCodeAt(this.pos)
  this.ch_code = isNaN(this.ch_code) ? null : this.ch_code
}

pp.nextToken = function () {
  this.prev_tok_begin = this.tok_begin
  this.prev_tok_end = this.pos
  this.skipSpace()
  this.readToken()
  return this.tok_type
}

pp.skipSpace = function () {
  while (this.ch_code === 32) this.nextChar()
}

pp.readToken = function () {
  this.tok_begin = this.pos

  switch (this.context) {
  // In regular context, numbers are always positive integers, and '-' is a connection
    case CONTEXT.regular:
      return (
        isWordStart(this.ch_code) ? this.readWord()
        : isDigit(this.ch_code) ? this.readPosInt()
        : isNotControl(this.ch_code) ? this.readOneCharToken()
        : this.ch_code === null ? this.finishToken(TT.eol)
        : (this.pos++, this.throw(`unexpected character '${this.ch}'`)))

    // In args or messages context, numbers can be floats, and '+-.' lead into numbers
    case CONTEXT.args: case CONTEXT.messages: case CONTEXT.list:
      return (
        isWordStart(this.ch_code) ? this.readWord()
        : isDigit(this.ch_code) ? this.readNumber()
        : [43, 45, 46].includes(this.ch_code) ? this.readNumber() // + - .
        : this.ch_code === 34 ? this.readString() // "
        : isNotControl(this.ch_code) ? this.readOneCharToken()
        : this.ch_code === null ? this.finishToken(TT.eol)
        : (this.pos++, this.throw(`unexpected character '${this.ch}'`)))
  }
}

pp.readOneCharToken = function () {
  this.finishToken(ttFromLabel.get(this.ch))
  this.nextChar()
}

pp.readPosInt = function () {
  let total = 0
  let cnt = 0

  while (this.ch_code >= 48 && this.ch_code <= 57) {
    total = total * 10 + (this.ch_code - 48)
    this.nextChar()
    cnt++
  }
  return (cnt !== 0) ? this.finishToken(TT.int, total) : this.finishToken(TT.int, NaN)
}

pp.readInt = function () {
  let sign = 1
  let total = 0
  let cnt = 0

  switch (this.ch_code) {
    case 43: sign = 1; this.nextChar(); break
    case 45: sign = -1; this.nextChar(); break
  }

  while (this.ch_code >= 48 && this.ch_code <= 57) {
    total = total * 10 + (this.ch_code - 48)
    this.nextChar()
    cnt++
  }
  return (cnt !== 0) ? this.finishToken(TT.int, total * sign) : this.finishToken(TT.int, NaN)
}

pp.readNumber = function () {
  this.trace('readNumber')
  let sign = 1
  let val = 0
  let decimal = 0
  let cnt = 0
  let pow = 1
  let is_float = false

  switch (this.ch_code) {
    case 43: sign = 1; this.nextChar(); break
    case 45: sign = -1; this.nextChar(); break
  }

  while ((this.ch_code >= 48) && (this.ch_code <= 57)) {
    val = val * 10 + (this.ch_code - 48)
    this.nextChar()
    cnt++
  }

  if (this.ch_code === 46) {
    is_float = true
    this.nextChar()
    while ((this.ch_code >= 48 && this.ch_code <= 57)) {
      decimal = decimal * 10 + (this.ch_code - 48)
      this.nextChar()
      pow *= 10
    }
  }
  val = sign * (val + decimal / pow)

  if ((cnt === 0) && (pow === 1)) return this.finishToken(TT.int, NaN)
  else if (is_float) {
    // pow === 1 indicates when to add a terminal period to force int to float
    if (pow !== 1) return this.finishToken(TT.float, val)
    else return this.finishToken(TT.cast_float, val)
  }
  else return this.finishToken(TT.int, val)
}

pp.readWord = function () {
  do this.nextChar()
  while (isWordChar(this.ch_code))
  const word = this.input.slice(this.tok_begin, this.pos)
  switch (this.context) {
    case CONTEXT.regular: case CONTEXT.list:
      return (
        this.commands.has(word) ? this.finishToken(TT[word])
        : this.classes.has(word) ? this.finishToken(TT.class, word)
        : this.finishToken(TT.word, word))
    case CONTEXT.args: case CONTEXT.messages:
      return this.finishToken(TT.word, word)
    default: this.throw('BUG: readWord: invalid context')
  }
}

pp.readString = function () {
  this.nextChar()
  this.tok_begin = this.pos

  while ((this.ch_code !== 34 || this.prev_ch_code === 92) && this.ch_code !== null) {
    this.nextChar()
  }
  if (this.ch_code === null) this.throw('string is not closed')

  this.finishToken(TT.string, this.input.slice(this.tok_begin, this.pos))
  this.nextChar()
}

pp.finishToken = function (tok_type, val) {
  this.tok_type = tok_type
  this.tok_value = val === undefined ? tok_type.label : val
}

pp.read = function (tok_type) {
  if (this.tok_type === tok_type) {
    this.nextToken()
    return true
  }
  else {
    return false
  }
}

pp.expect = function (tok_type, msg, prev) {
  if (this.tok_type === tok_type) this.nextToken()
  else if (msg) this.throw(msg, prev)
  else this.throw(`invalid token: ${tok_type.label} expected`, prev)
}

// ================  PROCESS COMMAND  ================

pp.processConnections = function () {
  const objects = [...this.st_graph.objects.values()]

  Util.first(objects).inlet_id = ''
  Util.last(objects).outlet_id = ''
  Util.aperture(objects).forEach(([first, second]) => {
    if (second.is_conn_to_prev === true) {
      const conn = new Connection(first.id, first.outlet, second.id, second.inlet)
      this.st_graph.connections.set(conn.id, conn)

      // Only display ids when there is more than one choice
      const outlet_cnt = this.json.classes[first.class].outlet_cnt
      first.outlet_id = (outlet_cnt === 'unknown') ? first.outlet.toString()
        : (outlet_cnt > 1) ? this.json.classes[first.class].outlet_ids[first.outlet]
        : ''
      const inlet_cnt = this.json.classes[second.class].inlet_cnt
      second.inlet_id = (inlet_cnt === 'unknown') ? second.inlet.toString()
        : (inlet_cnt > 1) ? this.json.classes[second.class].inlet_ids[second.inlet]
        : ''
    }
    else {
      first.outlet_id = ''
      second.inlet_id = ''
    }
  })
}

pp.processCommand = function () {
  switch (this.st_command) {
    case TT.add: this.graph.addGraph(this.st_graph, this.actions); break
    case TT.del: this.graph.delGraph(this.st_graph, this.actions); break
    case TT.disc: this.graph.discGraph(this.st_graph, this.actions); break
    case TT.view: this.graph.viewGraph(this.st_graph, this.actions); break
    case TT.delview: this.graph.delviewGraph(this.st_graph, this.actions); break
    case TT.mess: this.graph.messGraph(this.st_graph, this.actions); break

    case TT.audio: comm.send(`audio ${this.st_list[0]}`); break
    case TT.js: comm.send(this.st_list.join(' ')); break
    case TT.list: this.postList(this.st_list); break

    default: this.throw('BUG: processCommand: invalid command')
  }
}

pp.cmdArgsWarning = function (cmd, args, cnt) {
  if (args.length > cnt) {
    this.warn(`invalid arguments after '${cmd} ${args.slice(0, cnt).join(' ')}'`)
  }
}

pp.postList = function (args) {
  let str
  let coll

  switch (args[0]) {
    case undefined:
      str = `list [commands | classes | types | props | type <a_type> | prop <a_prop> | class <a_class>]`
      break

    case 'commands':
      this.cmdArgsWarning('list', args, 1)
      str = `available commands: ${[...this.commands].join(', ')}`
      break

    case 'classes':
      this.cmdArgsWarning('list', args, 1)
      coll = [...this.classes.keys()].sort()
      str = `available classes: ${coll.join(', ')}`
      break

    case 'types':
      this.cmdArgsWarning('list', args, 1)
      coll = [...this.types.keys()].sort()
      str = `available types: ${coll.join(', ')}`
      break

    case 'props':
      this.cmdArgsWarning('list', args, 1)
      coll = [...this.props.keys()].sort()
      str = `available properties: ${coll.join(', ')}`
      break

    case 'class':
      this.cmdArgsWarning('list', args, 2)
      const cl_info = this.json.classes[args[1]]

      if (cl_info === undefined) {
        str = `no class '${args[1]}'`
        break
      }

      const inlets = [...cl_info.inlet_ids]
      inlets[cl_info.inlet_def] = '*' + inlets[cl_info.inlet_def] + '*'
      const outlets = [...cl_info.outlet_ids]
      outlets[cl_info.outlet_def] = '*' + outlets[cl_info.outlet_def] + '*'

      str = `${args[1]}:\n  type: ${cl_info.type}\n` +
      `  inlets: ${inlets.join(', ')}\n` +
      `  outlets: ${outlets.join(', ')}` +
      (cl_info.props ? `\n  properties: ${cl_info.props.join(', ')}` : '')
      break

    case 'type':
      this.cmdArgsWarning('list', args, 2)
      coll = [...this.classes.keys()]
        .filter(cl => this.json.classes[cl].type === args[1])
        .sort()
      str = coll.length === 0
        ? `no classes of type '${args[1]}'`
        : `classes of type '${args[1]}': ${coll.join(', ')}`
      break

    case 'prop':
      this.cmdArgsWarning('list', args, 2)
      coll = [...this.classes.keys()]
        .filter(cl => (
          this.json.classes[cl].props &&
          this.json.classes[cl].props.includes(args[1])))
        .sort()
      str = coll.length === 0
        ? `no classes with the property '${args[1]}'`
        : `classes with the property '${args[1]}': ${coll.join(', ')}`
      break

    default:
      this.throw(`invalid arguments for list command`)
      break
  }
  info.post(str)
}

pp.updateLine = function () {
  const line = [...this.st_graph.objects.values()].map(obj => obj.getObjExpr()).join(' ')

  editor.cm.replaceRange(line,
    {line: this.line, ch: 0},
    {line: this.line, ch: editor.cm.getLine(this.line).length})
  editor.cm.setCursor(this.line, 0)
}

pp.updateObjList = function () {
  let list = ''
  this.graph.obj_by_classes.forEach((objects, cl) => {
    if (objects.size !== 0) {
      list += cl + ': ' + [...objects.values()].join(', ') + '\n'
    }
  })
  info.post(list)
}

// ================  COMMUNICATION  ================

pp.post = function (...msg) {
  console.log(...msg)
}

pp.setPostFrom = function (post_from) {
  this.post = (msg) => post_from.post(msg)
}

pp.tok_str = function () {
  return (this.tok_value === null)
    ? `'${this.tok_type.label}'`
    : `${this.tok_type.label}: ${this.tok_value}`
}

pp.obj_str = function () {
  return `${this.obj_class}: ${this.obj_id} (${this.obj_args}) [${this.obj_mess}] .${this.obj_inlet} .${this.obj_outlet}`
}

pp.loc = function () {
  return `(${this.line + 1}:${this.pos + 1})`
}

pp.trace = function (func) {
  if (traceParser) console.log(`TR: ${func}: ${this.loc()}`)
}

pp.db = function (lvl, ...msg) {
  if (dbParser >= lvl) console.log(msg.join(', '))
}

pp.warn = function (msg, prev) {
  const [begin, end, cursor] = (prev === PREV)
    ? [this.prev_tok_begin, this.prev_tok_end, this.prev_tok_end]
    : [this.tok_begin, this.pos, this.tok_begin]
  editor.add_err_highlight(this.line, begin, end, cursor)
  this.post(`Warning: ${msg} ${this.loc()}`)
}

pp.throw = function (msg, prev) {
  const [begin, end, cursor] = (prev === PREV)
    ? [this.prev_tok_begin, this.prev_tok_end, this.prev_tok_end]
    : [this.tok_begin, this.pos, this.tok_begin]
  editor.add_err_highlight(this.line, begin, end, cursor)
  this.post(`Error: ${msg} ${this.loc()}`)
  throw new SyntaxError(`${msg} ${this.loc()}`)
}
