const map = require('lib0/dist/map.cjs')

const WebSocketServer = require('rpc-websockets').Server
const {ChangeSet, Text} = "@codemirror/state"

class Doc {
  constructor(docName) {
    this.docName = docName
    // The updates received so far (updates.length gives the current version)
    this.updates = []
    this.doc = Text.of([`Start document-${docName}`])
  }
}

const docs = new Map()

const getDoc = (docname) => map.setIfUndefined(docs, docname, () => {
  const doc = new Doc(docname)
  docs.set(docname, doc)
  return doc
})

const server = new WebSocketServer({
  port: 4443,
  host: 'localhost'
})

// data = {docName, version, updates}
server.register("pushUpdates", (data) => {
  const doc = getDoc(data.docName)
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
    return true;
  }
})

server.register("pullUpdates", (data) => {
  const doc = getDoc(data.docName)
  if (data.version < doc.updates.length) {
    return doc.updates.slice(data.version)
  }
})

server.register("getDocument", (data) => {
  const doc = getDoc(data.docName)
  return {version: doc.updates.length, doc: doc.toString()}
})