```js
{
  type: "shell.spawn"
  clientID: clientID
  shellID: shellID
}
{
  type: "shell.info"
  shellID: shellID
  message: message
}
{
  type: "shell.request"
}
{
  type: "shell.compile"
  toID: clientID
  message: message
}
{
  type: "shell.keystroke"
  toID: clientID
  keystroke: keystroke
}
```