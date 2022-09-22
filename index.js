const map = require('lib0/dist/map.cjs')

const http = require('http')
const WebSocketServer = require('rpc-websockets').Server
const {ChangeSet, Text} = require("@codemirror/state")

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

const getDoc = (docname) => map.setIfUndefined(docs, docname, () => {
  const namespace = '/' + docname;
  const doc = new Doc(docname, wss.namespaces[namespace])
  wss.event('newUpdates', namespace)
  wss.event('newPeers', namespace)
  wss.register("getPeers", () => {
    return doc.namespace.clients.keys()
  }, namespace)

  wss.register("pushUpdates", (data) => {
    if (data.version !== doc.updates.length) {
      doc.namespace.emit("newUpdates")
      return false;
    } else {
      for (let update of data.updates) {
        // Convert the JSON representation to an actual ChangeSet
        // instance
        let changes = ChangeSet.fromJSON(update.changes)
        doc.updates.push({changes, clientID: update.clientID})
        doc.doc = changes.apply(doc.doc)
      }
      doc.namespace.emit("newUpdates")
      return true;
    }
  }, namespace)

  wss.register("pushShellUpdates", (data) => {
    const doc = getDoc(data.docName)
    if (data.shellVersion !== doc.shellUpdates.length) {
      doc.namespace.emit("newUpdates")
      return false;
    } else {
      Array.prototype.push.apply(doc.shellUpdates, data.shellUpdates)
      doc.namespace.emit("newUpdates")
      return true;
    }
  }, namespace)

  wss.register("pullUpdates", (data) => {
    console.log(data.version, doc.updates.length)
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
  }, namespace)

  return doc
})

wss.on("listening", () => {
  console.log(`listening at ${wss.wss.options.host}:${wss.wss.options.port}`)
})

wss.on("connection", (ws, msg) => {
  // console.log(ws)
  const docName = msg.url.slice(1)
  getDoc(docName)
})