const map = require('lib0/dist/map.cjs')
const WebSocketServer = require('rpc-websockets').Server
const {ChangeSet, Text} = require("@codemirror/state")
const {uuidv4} = require("lib0/random");

class Doc {
  constructor(docName, namespace) {
    this.docName = docName
    // The updates received so far (updates.length gives the current version)
    this.updates = []
    this.namespace = namespace
    this.shellUpdates = []
    this.doc = Text.of([""])
  }
}

const docs = new Map()
const host = process.env.HOST || 'localhost'
const port = process.env.PORT || 4443

const wss = new WebSocketServer({
  host: host,
  port: port
})

const tmp = {
  "jsonrpc": "2.0",
  "method": "private",
  "params": [42, 23],
  "id": uuidv4()
}

const getDoc = (docname) => map.setIfUndefined(docs, docname, () => {
  const namespace = wss.of('/' + docname);
  const doc = new Doc(docname, namespace)

  const sendToPeer = (to, channel, message = {}) => {
    try {
      const privateMessage = {
        "jsonrpc": "2.0",
        "method": channel,
        "params": message
      }
      // console.log(namespace.clients().clients.get(to))
      namespace.clients().clients.get(to).send(
          JSON.stringify(privateMessage)
      )
      return true;
    } catch (e) {
      console.log(e)
      return false;
    }
  }
  const notifyNewUpdates = (id) => {
    sendToPeer(id, "newUpdates")
  }
  namespace.register("getPeers", () => {
    return namespace.clients.keys()
  })
  namespace.register("sendToPrivate", (data) => {
    sendToPeer(data.toID, data.channel, data.message)
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

  return doc
})

wss.on("listening", () => {
  console.log(`listening at ${wss.wss.options.host}:${wss.wss.options.port}`)
})

wss.on("connection", (ws, msg) => {
  // console.log(ws)
  const docName = msg.url.slice(1)

  const doc = getDoc(docName)
})