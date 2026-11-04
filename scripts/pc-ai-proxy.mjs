// Optional temporary desktop bridge. No autostart, no credential handling or packet logs.
import { createServer, createConnection, isIP } from 'node:net'
import { pathToFileURL } from 'node:url'

export function startPcProxy({ bind, port, nasAddress, proxyPort, allowedHosts, proxyHost = '127.0.0.1' }) {
  if (isIP(bind) !== 4 || bind === '0.0.0.0' || isIP(nasAddress) !== 4 || !allowedHosts?.length) throw Error('Explicit LAN bind, NAS address and allowed hosts are required')
  const allowed = new Set(allowedHosts.map(value => value.toLowerCase())), sockets = new Set()
  const server = createServer(client => {
    if (client.remoteAddress !== nasAddress || sockets.size >= 8) { client.destroy(); return }
    sockets.add(client); client.once('close', () => sockets.delete(client))
    let header = Buffer.alloc(0)
    client.setTimeout(5000, () => client.destroy())
    function receive(chunk) {
      header = Buffer.concat([header, chunk])
      const end = header.indexOf('\r\n\r\n')
      if (end < 0 && header.length <= 16384) return
      const first = end >= 0 ? header.subarray(0, Math.min(end, 1000)).toString('ascii').split('\r\n')[0] : ''
      const match = /^CONNECT ([a-z0-9.-]+):443 HTTP\/1\.[01]$/i.exec(first)
      if (end > 16384 || !match || !allowed.has(match[1].toLowerCase())) { client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return }
      client.removeListener('data', receive); client.pause()
      const upstream = createConnection({ host: proxyHost, port: proxyPort })
      upstream.setTimeout(60000, () => upstream.destroy())
      client.setTimeout(60000, () => client.destroy())
      upstream.once('connect', () => { upstream.write(header); header = Buffer.alloc(0); client.pipe(upstream); upstream.pipe(client); client.resume() })
      upstream.on('error', () => client.destroy()); client.on('error', () => upstream.destroy())
      upstream.once('close', () => { if (!upstream.readableEnded) client.destroy() }); client.once('close', () => upstream.destroy())
    }
    client.on('error', () => client.destroy()); client.on('data', receive)
  })
  server.listen(port, bind)
  const close = () => { for (const socket of sockets) socket.destroy(); server.close() }
  return { server, close }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(value => { const at = value.indexOf('='); if (at < 0) throw Error('Expected --name=value'); return [value.slice(2, at), value.slice(at + 1)] }))
  const bridge = startPcProxy({ bind: args.bind, port: Number(args.port), nasAddress: args.nas, proxyPort: Number(args['proxy-port']), allowedHosts: (args.hosts || '').split(',').filter(Boolean) })
  bridge.server.on('listening', () => process.stdout.write('Temporary NAS-only AI proxy ready; no autostart.\n'))
  bridge.server.on('error', () => { process.stderr.write('Temporary proxy could not start.\n'); process.exitCode = 1 })
  process.once('SIGTERM', bridge.close); process.once('SIGINT', bridge.close)
}
