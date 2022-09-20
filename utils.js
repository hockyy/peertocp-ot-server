const pingTimeout = 30000

const encoding = require('lib0/dist/encoding.cjs')
const decoding = require('lib0/dist/decoding.cjs')
const map = require('lib0/dist/map.cjs')

const messagePullUpdates = 0
const messagePushUpdates = 1
const messageGetDocuments = 2

const wsReadyStateConnecting = 0
const wsReadyStateOpen = 1
const wsReadyStateClosing = 2 // eslint-disable-line
const wsReadyStateClosed = 3 // eslint-disable-line

import {
  Update,
  receiveUpdates,
  sendableUpdates,
  collab,
  getSyncedVersion
} from "@codemirror/collab"
import {basicSetup} from "codemirror"
import {ChangeSet, EditorState, Text} from "@codemirror/state"

class Doc {
  constructor(docName) {
    this.docName = docName
    // The updates received so far (updates.length gives the current version)
    this.updates = []
    // The current document
    this.doc = Text.of(["Start document"])
    //!authorityMessage
    this.pending = []
    this.conns = new Set()
  }

  message(data, messageChannel) {
    function resp(value) {
      messageChannel[0].postMessage(JSON.stringify(value))
    }

    data = JSON.parse(data)
    if (data.type === "pullUpdates") {
    } else if (data.type === "pushUpdates") {
      if (data.version !== this.updates.length) {
        resp(false)
      } else {
        for (let update of data.updates) {
          // Convert the JSON representation to an actual ChangeSet
          // instance
          let changes = ChangeSet.fromJSON(update.changes)
          this.updates.push({changes, clientID: update.clientID})
          this.doc = changes.apply(this.doc)
        }
        resp(true)
        // Notify pending requests
        while (this.pending.length) {
          this.pending.pop()
          !(data.updates)
        }
      }
    } else if (data.type === "getDocument") {
      resp({version: this.updates.length, doc: this.doc.toString()})
    }
  }

}

const closeConn = (doc, conn) => {
  if (doc.conns.has(conn)) {
    doc.conns.delete(conn)
  }
  conn.close()
}

const send = (doc, conn, m) => {
  if (conn.readyState !== wsReadyStateConnecting && conn.readyState
      !== wsReadyStateOpen) {
    closeConn(doc, conn)
  }
  try {
    conn.send(m, err => {
      err != null && closeConn(doc, conn)
    })
  } catch (e) {
    console.log(e)
    closeConn(doc, conn)
  }
}

const docs = new Map()

const getDoc = (docname) => map.setIfUndefined(docs, docname, () => {
  const doc = new Doc(docname)
  docs.set(docname, doc)
  return doc
})

/**
 * @param {any} conn
 * @param {Doc} doc
 * @param {Uint8Array} message
 */
const messageListener = (conn, doc, message) => {
  try {
    const encoder = encoding.createEncoder()
    const decoder = decoding.createDecoder(message)
    const messageType = decoding.readVarUint(decoder)
    const data = JSON.parse(decoding.readVarString(decoder))
    encoding.writeVarUint(encoder, messageType)

    function resp(value) {
      encoding.writeVarString(encoder, JSON.stringify(value))
      send(doc, conn, encoder)
    }

    switch (messageType) {
      case messagePullUpdates: {
        if (data.version < doc.updates.length) {
          resp(doc.updates.slice(data.version))
        } else {
          doc.pending.push(resp)
        }
        break
      }
      case messagePushUpdates: {
        if (data.version !== doc.updates.length) {
          resp(false)
        } else {
          for (let update of data.updates) {
            // Convert the JSON representation to an actual ChangeSet
            // instance
            let changes = ChangeSet.fromJSON(update.changes)
            doc.updates.push({changes, clientID: update.clientID})
            doc.doc = changes.apply(doc.doc)
          }
          resp(true)
          // Notify pending requests
          while (doc.pending.length) {
            doc.pending.pop()(data.updates)
          }
        }
        break
      }
      case messageGetDocuments: {
        resp({version: doc.updates.length, doc: doc.toString()})
        break
      }
    }
  } catch (err) {
    console.error(err)
  }
}

/**
 * @param {any} conn
 * @param {any} req
 * @param {any} opts
 */
exports.setupWSConnection = (conn, req,
    {docName = req.url.slice(1).split('?')[0]} = {}) => {
  conn.binaryType = 'arraybuffer'
  // get doc, initialize if it does not exist yet
  const doc = getDoc(docName)
  // listen and reply to events
  conn.on('message',
      /** @param {ArrayBuffer} message */message => messageListener(conn, doc,
          new Uint8Array(message)))

  // Check if connection is still alive
  let pongReceived = true
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) {
        doc.closeConn(conn)
      }
      clearInterval(pingInterval)
    } else if (doc.conns.has(conn)) {
      pongReceived = false
      try {
        conn.ping()
      } catch (e) {
        doc.closeConn(conn)
        clearInterval(pingInterval)
      }
    }
  }, pingTimeout)
  conn.on('close', () => {
    doc.closeConn(conn)
    clearInterval(pingInterval)
  })
  conn.on('pong', () => {
    pongReceived = true
  })
}
