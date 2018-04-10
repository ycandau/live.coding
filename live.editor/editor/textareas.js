// Helper functions for codemirror

/* global CodeMirror */

function makeMarker ({ char = '▶', color = '#f00' } = {}) {
  const marker = document.createElement('div')
  marker.innerHTML = char
  marker.style.color = color
  return marker
}

function makePanel (title, id) {
  const node = document.createElement('div')
  node.id = 'panel-' + id
  node.className = 'panel'

  const label = node.appendChild(document.createElement('span'))
  label.textContent = title

  const close = node.appendChild(document.createElement('a'))
  close.title = 'Clear the text area.'
  close.className = 'clear_button'
  close.textContent = '✖'

  return node
}

// ================  OBJECTS WINDOW  ================

CodeMirror.defineSimpleMode('info', {
  start: [
    { regex: /.*:/, token: 'class' }
  ]
})

function TextArea (dom_id, title, id) {
  this.cm = new CodeMirror(document.querySelector(dom_id), {
    mode:         'info',
    value:        '',
    theme:        'default',
    lineNumbers:  false,
    lineWrapping: true,
    readOnly:     true
  })

  this.cm.setSize(null, '100%')
  this.cm.addPanel(makePanel(title, id), { position: 'top', stable: true })
}

TextArea.prototype.post = function (msg) {
  this.cm.setValue(msg)
}

// ================  OUTPUT WINDOW  ================

CodeMirror.defineSimpleMode('output', {
  start: [
    { regex: /WS:/, token: 'websocket' },
    { regex: /Send:/, token: 'send' },
    { regex: /Error:/, token: 'error' },
    { regex: /Warning:/, token: 'warning' },
    { regex: /\([0-9]+:[0-9]+\)/, token: 'websocket' }
  ]
})

function TextAreaScroll (dom_id, title, id) {
  this.cm = new CodeMirror(document.querySelector(dom_id), {
    mode:         'output',
    value:        '',
    theme:        'default',
    lineNumbers:  false,
    lineWrapping: true,
    readOnly:     true
  })

  this.text = []
  this.cm.setSize(null, '100%')
  this.cm.addPanel(makePanel(title, id), { position: 'top', stable: true })
}

TextAreaScroll.prototype.post = function (msg) {
  this.text.push(msg)
  this.cm.setValue(this.text.join('\n'))
  this.cm.scrollIntoView({line: this.text.length - 1, ch: 0})
}

const db_editor = 0

/* global CodeMirror */

// ================  EDITOR WINDOW  ================

CodeMirror.defineSimpleMode('editor', {
  start: [
    { regex: /add|new|rem|del|disc|view|mess/, token: 'command' },
    { regex: /[\w]*:/, token: 'class' },
    { regex: /\([\w, ]*\)/, token: 'args' },
    { regex: /\[[\w,: ]*\]/, token: 'messages' },
    { regex: /\.([\w]*)/, token: 'outlet' },
    { regex: /[\w]+/, token: 'object' },
    { regex: /&/, token: 'object' }
  ]
})

function Editor (dom_id, title, id) {
  this.cm = CodeMirror(document.querySelector(dom_id), {

    mode:  'editor',
    value: `myo:myo0(param).0.0 - force:force0().0.0
myo-force
myo-force-concat1-atodb-dbtoa-scale-unpack(1 2 3 4)-maxobj(pack 1 2)-output
add unpack(1 2 3)-myo`,
    theme:   'default',
    gutters: ['CodeMirror-linenumbers', 'breakpoints'],

    lineNumbers:       true,
    lineWrapping:      true,
    styleActiveLine:   true,
    autofocus:         true,
    matchBrackets:     true,
    autoCloseBrackets: true,

    extraKeys: {
      'Esc':        () => this.undoLineChg(),
      'Ctrl-Up':    () => this.scrollLine(-1),
      'Ctrl-Down':  () => this.scrollLine(1),
      'Ctrl-Enter': () => this.doProcess()
    }
  })

  this.line_cur = this.cm.getCursor().line
  this.handle_cur = this.cm.getLineHandle(this.line_cur)
  this.change_gen = this.cm.changeGeneration()
  this.line_before_chg = ''
  this.scroll_line = this.line_cur
  this.err_highlights = []

  this.cm.setSize(null, '100%')
  this.cm.addPanel(makePanel(title, id), { position: 'top', stable: true })
  this.cm.on('cursorActivity', () => this.onCursorActivity())
  this.storeLine()
}

const ep = Editor.prototype

// Check if the cursor changes line and the line content has changed
ep.onCursorActivity = function () {
  const new_line = this.cm.getCursor().line

  // If the cursor remains on the same line
  if (new_line === this.line_cur) return

  // If the cursor remains on the same handle (lines have shifted)
  if (new_line === this.cm.getLineNumber(this.handle_cur)) { }

  // Else if the cursor is on a different line and handle
  else this.storeLine()

  this.line_cur = new_line
  this.handle_cur = this.cm.getLineHandle(new_line)
  this.scroll_line = new_line
}

// Undo line changes
ep.undoLineChg = function () {
  if (!this.cm.isClean(this.change_gen)) {
    this.replaceLine(this.line_before_chg)
    this.change_gen = this.cm.changeGeneration()
    this.scroll_line = this.line_cur
  }
}

// Set the line to a line above or below
ep.scrollLine = function (incr) {
  if (this.scroll_line === this.line_cur) this.storeLine()
  this.scroll_line += incr
  let new_line = ''
  switch (this.scroll_line) {
    case -2:
      this.scroll_line = -1
      return
    case -1:
    case this.cm.lineCount():
      break
    case this.line_cur:
      new_line = this.line_before_chg
      break
    case this.cm.lineCount() + 1:
      this.scroll_line = this.cm.lineCount()
      return
    default:
      new_line = this.cm.getLine(this.scroll_line)
      break
  }
  this.replaceLine(new_line)
}

// Process the line
ep.doProcess = function () {
  this.clear_err_highlights()
  this.processLine(this.cm.getLine(this.line_cur), this.line_cur)
  this.storeLine()
  this.change_gen = this.cm.changeGeneration()
}

ep.processLine = function (line, l) {
  console.log(`process:  '${line}'`)
}

ep.setProcess = function (process) {
  this.processLine = function (line, l) {
    process(line, l)
  }
}

// ================  UTIL  ================

ep.storeLine = function () {
  this.line_before_chg = this.cm.getLine(this.cm.getCursor().line)
}

ep.replaceLine = function (line) {
  this.cm.replaceRange(line,
    { line: this.line_cur, ch: 0 },
    { line: this.line_cur, ch: this.cm.getLine(this.line_cur).length })
}
ep.add_err_highlight = function (line_ind, ch_begin, ch_end, cursor) {
  this.err_highlights.push(this.cm.markText(
    { line: line_ind, ch: ch_begin },
    { line: line_ind, ch: ch_end },
    { className: 'err-highlight' }))
  this.cm.setCursor(line_ind, cursor)
}

ep.clear_err_highlights = function () {
  while (this.err_highlights.length > 0) this.err_highlights.pop().clear()
}

ep.post = function (msg) {
  console.log(msg)
}

ep.db = function (lvl, ...msg) {
  if (db_editor >= lvl) console.log(msg.join(', '))
}
