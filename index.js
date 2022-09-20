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

const getDoc = (docname) => map.setIfUndefined(docs, docname, () => {
  const doc = new Doc(docname)
  docs.set(docname, doc)
  return doc
})

const server = http.createServer((request, response) => {
  response.writeHead(200, {'Content-Type': 'text/plain'})
  response.end('okay')
})

const wss = new WebSocketServer({
  noServer: true
})

server.on('upgrade', (request, socket, head) => {
  // You may check auth of request here..
  // See https://github.com/websockets/ws#client-authentication
  /**
   * @param {any} ws
   */
  const handleAuth = ws => {
    wss.wss.emit('connection', ws, request)
  }
  wss.wss.handleUpgrade(request, socket, head, handleAuth)
})

wss.event("connection", e => {
  console.log("OK", e)
})

// data = {docName, version, updates}
wss.register("pushUpdates", (data) => {
  console.log("Here")
  const doc = getDoc(data.docName)
  if (data.version !== doc.updates.length) {
    wss.emit('newUpdates')
    return false;
  } else {
    for (let update of data.updates) {
      // Convert the JSON representation to an actual ChangeSet
      // instance
      let changes = ChangeSet.fromJSON(update.changes)
      doc.updates.push({changes, clientID: update.clientID})
      doc.doc = changes.apply(doc.doc)
    }
    wss.emit('newUpdates')
    return true;
  }
})

wss.register("pullUpdates", (data) => {
  const doc = getDoc(data.docName)
  if (data.version < doc.updates.length) {
    return doc.updates.slice(data.version)
  }
})

wss.register("getDocument", (data) => {
  const doc = getDoc(data.docName)
  return {version: doc.updates.length, doc: doc.toString()}
})

const host = process.env.HOST || 'localhost'
const port = process.env.PORT || 1234

server.listen(port, host, () => {
  console.log(`running at '${host}' on port ${port}`)
})