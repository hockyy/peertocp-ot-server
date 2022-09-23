const map = require('lib0/dist/map.cjs')
const WebSocketServer = require('rpc-websockets').Server
const {ChangeSet, Text} = require("@codemirror/state")
const http = require("http")
const {uuidv4} = require("lib0/random");

const idToDoc = new Map();

class Doc {
  constructor(docName, namespace, notifyNewPeers, sendToPeer) {
    this.docName = docName
    // The updates received so far (updates.length gives the current version)
    this.updates = []
    this.namespace = namespace
    this.shellUpdates = []
    this.doc = Text.of([""])
    this.peerInfo = new Map()
    this.notifyNewPeers = notifyNewPeers
    this.sendToPeer = sendToPeer
  }
}

const docs = new Map()
const host = process.env.HOST || 'localhost'
const port = process.env.PORT || 4443

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' })
  response.end('okay')
})

const wss = new WebSocketServer({
  noServer: true
})

const getDoc = (docname) => map.setIfUndefined(docs, docname, () => {
  const namespace = wss.of('/' + docname);

  namespace.register("sendToPrivate", (data) => {
    console.log(data)
    sendToPeer(data.to, data.channel, data.message)
    return true;
  })

  const broadcast = (channel, message = {}) => {
    try {
      const privateMessage = JSON.stringify({
        "jsonrpc": "2.0",
        "method": channel,
        "params": message
      })
      for (client of namespace.clients().clients.values()) {
        client.send(privateMessage)
      }
    } catch (e) {
      console.log(e)
      return false;
    }
  }

  const notifyNewPeers = (id) => {
    broadcast("newPeers")
  }

  const notifyNewUpdates = (id) => {
    broadcast("newUpdates")
  }

  const sendToPeer = (to, channel, message = {}) => {
    try {
      const privateMessage = JSON.stringify({
        "jsonrpc": "2.0",
        "method": channel,
        "params": message
      })
      namespace.clients().clients.get(to).send(privateMessage)
      return true;
    } catch (e) {
      console.log(e)
      return false;
    }
  }

  const doc = new Doc(docname, namespace, notifyNewPeers, sendToPeer)

  namespace.register("getPeers", (_, id) => {
    return {
      selfid: id,
      ids: Object.fromEntries(doc.peerInfo)
    }
  })

  namespace.register("pushUpdates", (data, id) => {
    if (data.version !== doc.updates.length) {
      notifyNewUpdates(id)
      return false;
    } else {
      for (let update of data.updates) {
        // Convert the JSON representation to an actual ChangeSet
        // instance
        let changes = ChangeSet.fromJSON(update.changes)
        doc.updates.push({changes, clientID: update.clientID})
        doc.doc = changes.apply(doc.doc)
      }
      notifyNewUpdates(id)
      return true;
    }
  })

  namespace.register("pushShellUpdates", (data) => {
    const doc = getDoc(data.docName)
    if (data.shellVersion !== doc.shellUpdates.length) {
      notifyNewUpdates(id)
      return false;
    } else {
      Array.prototype.push.apply(doc.shellUpdates, data.shellUpdates)
      notifyNewUpdates(id)
      return true;
    }
  })

  namespace.register("pullUpdates", (data) => {
    let ret = {
      updates: [],
      shellUpdates: []
    }
    if (data.version < doc.updates.length) {
      ret.updates = doc.updates.slice(data.version);
    }
    if (data.shellVersion < doc.shellUpdates.length) {
      ret.shellUpdates = doc.shellUpdates.slice(data.shellVersion)
    }
    return ret;
  })

  namespace.register("ping", () => {
    return true;
  })

  return doc
})

wss.on("listening", () => {
  console.log(`listening at ${wss.wss.options.host}:${wss.wss.options.port}`)
})

wss.on("connection", (ws, msg) => {
  // console.log(ws)
  const docName = msg.url.slice(1)
  idToDoc.set(ws._id, docName)
  const doc = getDoc(docName)
  doc.peerInfo.set(ws._id, {
    color: msg.headers.color,
    colorlight: msg.headers.colorlight,
    name: msg.headers.username
  })
  doc.notifyNewPeers()
})

wss.on("disconnection", (ws) => {

  const docName = idToDoc.get(ws._id)
  idToDoc.delete(ws._id)
  const doc = getDoc(docName)
  doc.peerInfo.delete(ws._id)
  doc.notifyNewPeers()
})


server.on('upgrade', (request, socket, head) => {
  // You may check auth of request here..
  /**
   * @param {any} ws
   */
  const handleAuth = ws => {
    wss.wss.emit('connection', ws, request)
  }
  wss.wss.handleUpgrade(request, socket, head, handleAuth)
})

server.listen(port)

console.log('Signaling server running on localhost:', port)
