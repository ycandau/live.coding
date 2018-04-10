/* global WebSocket */

// ================  COMMUNICATION OBJECT  ================

function Communication () {
  this.ws = null
  this.connected = false
  this.connectTask = null
}

Communication.prototype.connect = function (host = 'localhost', port = '8082') {
  if (!('WebSocket' in window)) {
    this.post('WS: WebSockets not available in this browser.')
    return
  }

  if (this.connected === true) {
    if (this.connectTask !== null) {
      clearInterval(this.connectTask)
      this.connectTask = null
    }
    return
  }

  const address = 'ws://' + host + ':' + port
  this.ws = new WebSocket(address)
  this.post('WS: Connecting to ' + address)

  this.ws.onopen = (ev) => {
    this.post('WS: Connected to ' + address)
    this.connected = true
    this.send('init_ws')

    // cancel the auto-reconnect task
    if (this.connectTask !== null) { clearInterval(this.connectTask) }
    this.connectTask = null
  }

  this.ws.onclose = (ev) => {
    this.post('WS: Disconnected from ' + address)
    this.connected = false
    // set up an auto-reconnect task
    if (this.connectTask !== null) {
      this.connectTask = setInterval(this.connect, 1000)
    }
  }

  this.ws.onmessage = (ev) => { console.log('onmessage: ', ev.data) }
  this.ws.onerror = (ev) => { this.post('WS: WebSocket error.') }
}

Communication.prototype.post = function (msg) {
  console.log(msg)
}

Communication.prototype.setPostFrom = function (post_from) {
  this.post = function (msg) { post_from.post(msg) }
}

Communication.prototype.send = function (msg) {
  if (this.ws !== null) { this.ws.send(msg) }
  this.post('Send: ' + msg)
}
