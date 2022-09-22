const map = require('lib0/dist/map.cjs')

const http = require('http')
const WebSocketServer = require('rpc-websockets').Server
const {ChangeSet, Text} = require("@codemirror/state")

class Doc {
  constructor(docName) {
    this.docName = docName
    // The updates received so far (updates.length gives the current version)
    this.updates = []
    this.doc = Text.of([""])
  }
}

const docs = new Map()
const host = process.env.HOST || 'localhost'
const port = process.env.PORT || 4443

const getDoc = (docname) => map.setIfUndefined(docs, docname, () => {
  const doc = new Doc(docname)
  docs.set(docname, doc)
  return doc
})

const wss = new WebSocketServer({
  host: host,
  port: port
})

wss.event('newUpdates')

wss.on("listening", () => {
  console.log(`listening at ${wss.wss.options.host}:${wss.wss.options.port}`)
})

// data = {docName, version, updates}
wss.register("pushUpdates", (data) => {
  const doc = getDoc(data.docName)
  console.log(data.version, doc.updates.length)
  if (data.version !== doc.updates.length) {
    return false;
  } else {
    for (let update of data.updates) {
      // Convert the JSON representation to an actual ChangeSet
      // instance
      let changes = ChangeSet.fromJSON(update.changes)
      doc.updates.push({changes, clientID: update.clientID})
      doc.doc = changes.apply(doc.doc)
    }
    wss.emit("newUpdates")
    return true;
  }
})

wss.register("pullUpdates", (data) => {
  const doc = getDoc(data.docName)
  console.log(data.version, doc.updates.length)
  if (data.version < doc.updates.length) {
    return doc.updates.slice(data.version)
  }
})

wss.register("getDocument", (data) => {
  const doc = getDoc(data.docName)
  return {version: doc.updates.length, doc: doc.toString()}
})