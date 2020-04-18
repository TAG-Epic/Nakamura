const EventEmitter = require('eventemitter3')
const ws = require('ws')
const erlpack = require('erlpack')
const { GATEWAY_URL, GatewayOpcodes } = require('../Constants')

module.exports = class Shard extends EventEmitter {
    constructor(client) {
        super()
        this._seq = null
        this._heartbeatAck = true
        this._sessionId = null
        this._ws = null
        this._heartbeatInterval = null
        this.client = client
    }

    send(o) {
        this._ws.send(erlpack.pack(o))
    }

    emit(s, m) {
        this.client.emit(s, m)
    }

    connect() {
        this._ws = new ws(`${GATEWAY_URL}?v6&encoding=etf`)

        this._ws.on('open', _ => { this.emit('debug', 'connection opened') })
        this._ws.on('message', msg => {
            msg = erlpack.unpack(msg)
            if (msg.s) {
                this._seq = msg.s
                this.emit('debug', `new sequence number or something: ${this._seq}`)
            }
            switch (msg.op) {
                case GatewayOpcodes.DISPATCH:
                    this.emit('debug', `dispatch event: ${msg.t}`)
                    switch (msg.t) {
                        case 'READY':
                            this.client.user = msg.d.user
                            this._sessionId = msg.d.session_id
                            break
                        default:
                            break
                    }
                    break
                case GatewayOpcodes.HELLO:
                    this.emit('debug', `hello receieved, starting heartbeating at ${msg.d.heartbeat_interval}ms`)
                    this._heartbeatInterval = setInterval(_ => { this.heartbeat() }, msg.d.heartbeat_interval)
                    this.identify()
                    break
                case GatewayOpcodes.HEARTBEAT_ACK:
                    this.emit('debug', 'heartbeat acked, nice')
                    this._heartbeatAck = true
                    break
                default: break
            }
        })
        this._ws.on('close', (code, msg) => {
            this.emit('debug', `websocket closed\ncode: ${code}\nmessage: ${msg}`)
            this._ws = null
            clearInterval(this._heartbeatInterval)
            this.connect()
        })
        this._ws.on('error', (err) => this.emit('debug', `oopsie doopsie websocket errorsie: ${err}`))
    }

    heartbeat() {
        if (!this._heartbeatAck) {
            this._ws.close()
        }
        this.emit('debug', 'sent heartbeat')
        this.send({
            op: GatewayOpcodes.HEARTBEAT,
            d: this._seq
        })
        this._heartbeatAck = false
    }

    resume() {
        this.send({
            op: GatewayOpcodes.RESUME,
            d: {
                token: `Bot ${this.client.token}`,
                session_id: this._sessionId,
                seq: this._seq
            }
        })
    }

    identify() {
        this.emit('debug', 'attempting to identify')
        this.send({
            op: GatewayOpcodes.IDENTIFY,
            d: {
                token: `Bot ${this.client.token}`,
                properties: {
                    $os: "linux",
                    $browser: "Nakamura (Testing version)",
                    $device: "Nakamura (Testing version)"
                },
                shard: [0, 1],
                intents: 513
            }
        })
    }
}