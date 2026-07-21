import tls from 'node:tls';
import type { ConnectedAccountConfig, EmailAddress } from './ConnectedAdapters';
import type { EmailSendAdapter, EmailSendResult, OutboundEmail } from './OutboundAdapters';

function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value,'utf8').toString('base64')}?=`;
}
function address(value: EmailAddress): string {
  return value.name ? `${encodeHeader(value.name)} <${value.address}>` : value.address;
}
function foldBase64(value: Buffer): string {
  return value.toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? '';
}
function escapeBody(value: string): string {
  return value.replace(/\r?\n/g,'\r\n').replace(/^\./gm,'..');
}

export function buildMimeMessage(message: OutboundEmail): string {
  const mixedBoundary = `wlcrm-mixed-${message.messageId.replace(/[^a-zA-Z0-9]/g,'')}`;
  const altBoundary = `wlcrm-alt-${message.messageId.replace(/[^a-zA-Z0-9]/g,'')}`;
  const headers = [
    `Message-ID: <${message.messageId}>`,
    `Date: ${new Date().toUTCString()}`,
    `From: ${address(message.from)}`,
    `To: ${message.to.map(address).join(', ')}`,
    ...(message.cc?.length ? [`Cc: ${message.cc.map(address).join(', ')}`] : []),
    `Subject: ${encodeHeader(message.subject)}`,
    ...(message.inReplyTo ? [`In-Reply-To: <${message.inReplyTo.replace(/[<>]/g,'')}>`] : []),
    ...(message.references?.length ? [`References: ${message.references.map((value)=>`<${value.replace(/[<>]/g,'')}>`).join(' ')}`] : []),
    'MIME-Version: 1.0',
  ];
  const bodyParts: string[] = [];
  if (message.bodyHtml) {
    bodyParts.push(
      `--${altBoundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      escapeBody(message.bodyText),
      `--${altBoundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      escapeBody(message.bodyHtml),
      `--${altBoundary}--`,
    );
  } else {
    bodyParts.push('Content-Type: text/plain; charset=utf-8','Content-Transfer-Encoding: 8bit','',escapeBody(message.bodyText));
  }

  if (!message.attachments?.length) {
    if (message.bodyHtml) headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    return `${headers.join('\r\n')}\r\n\r\n${bodyParts.join('\r\n')}`;
  }

  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
  const mixed: string[] = [`--${mixedBoundary}`];
  if (message.bodyHtml) {
    mixed.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`,'',...bodyParts);
  } else {
    mixed.push(...bodyParts);
  }
  for (const attachment of message.attachments) {
    const safeFilename = attachment.filename.replace(/[\r\n"]/g,'_');
    mixed.push(
      `--${mixedBoundary}`,
      `Content-Type: ${attachment.mimeType}; name="${safeFilename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${safeFilename}"`,
      '',
      foldBase64(attachment.content),
    );
  }
  mixed.push(`--${mixedBoundary}--`);
  return `${headers.join('\r\n')}\r\n\r\n${mixed.join('\r\n')}`;
}

class SmtpSession {
  private socket: tls.TLSSocket | null = null;
  private buffer = '';

  async connect(urlValue: string): Promise<void> {
    const url = new URL(urlValue);
    if (url.protocol !== 'smtps:') throw new Error('WI7 SMTP requires a smtps:// TLS endpoint');
    const host = url.hostname;
    const port = Number(url.port || 465);
    this.socket = await new Promise<tls.TLSSocket>((resolve,reject)=>{
      let client: tls.TLSSocket;
      client = tls.connect({host,port,servername:host,minVersion:'TLSv1.2',rejectUnauthorized:true},()=>resolve(client));
      client.setTimeout(30_000,()=>client.destroy(new Error('SMTP connection timed out')));
      client.on('error',reject);
    });
    await this.expect([220]);
  }

  async command(command: string, codes: number[]): Promise<string[]> {
    if (!this.socket) throw new Error('SMTP session is not connected');
    this.socket.write(`${command}\r\n`);
    return this.expect(codes);
  }

  async data(content: string): Promise<void> {
    await this.command('DATA',[354]);
    if (!this.socket) throw new Error('SMTP session is not connected');
    this.socket.write(`${content}\r\n.\r\n`);
    await this.expect([250]);
  }

  async close(): Promise<void> {
    if (!this.socket) return;
    try { await this.command('QUIT',[221]); } catch { /* connection may already be closed */ }
    this.socket.end();
    this.socket.destroy();
    this.socket = null;
  }

  private async expect(codes: number[]): Promise<string[]> {
    const lines: string[] = [];
    while (true) {
      const line = await this.readLine();
      lines.push(line);
      const match = line.match(/^(\d{3})([ -])/);
      if (!match) continue;
      if (match[2] === '-') continue;
      const code = Number(match[1]);
      if (!codes.includes(code)) throw new Error(`SMTP command failed: ${lines.join(' | ').slice(0,1000)}`);
      return lines;
    }
  }

  private async readLine(): Promise<string> {
    while (true) {
      const index = this.buffer.indexOf('\r\n');
      if (index >= 0) {
        const line = this.buffer.slice(0,index);
        this.buffer = this.buffer.slice(index + 2);
        return line;
      }
      if (!this.socket) throw new Error('SMTP session is closed');
      const chunk = await new Promise<Buffer>((resolve,reject)=>{
        const socket = this.socket!;
        const onData = (value: Buffer) => { cleanup(); resolve(value); };
        const onError = (error: Error) => { cleanup(); reject(error); };
        const onEnd = () => { cleanup(); reject(new Error('SMTP connection closed unexpectedly')); };
        const cleanup = () => { socket.off('data',onData);socket.off('error',onError);socket.off('end',onEnd); };
        socket.once('data',onData);socket.once('error',onError);socket.once('end',onEnd);
      });
      this.buffer += chunk.toString('utf8');
    }
  }
}

export class SmtpSendAdapter implements EmailSendAdapter {
  async send(config: ConnectedAccountConfig, secret: Record<string,string>, message: OutboundEmail): Promise<EmailSendResult> {
    const smtpUrl = String(config.settings.smtpUrl ?? '');
    if (!smtpUrl) throw new Error('SMTP endpoint is not configured for this email account');
    const username = String(config.settings.smtpUsername ?? config.username);
    const password = String(secret.smtpPassword ?? secret.password ?? '');
    if (!password) throw new Error('SMTP credentials are unavailable');
    const session = new SmtpSession();
    const recipients = [...message.to,...(message.cc ?? []),...(message.bcc ?? [])].map((item)=>item.address.toLowerCase());
    if (!recipients.length) throw new Error('At least one recipient is required');
    try {
      await session.connect(smtpUrl);
      await session.command(`EHLO ${String(config.settings.smtpClientName ?? 'localhost')}`,[250]);
      await session.command(`AUTH PLAIN ${Buffer.from(`\0${username}\0${password}`,'utf8').toString('base64')}`,[235]);
      await session.command(`MAIL FROM:<${message.from.address}>`,[250]);
      const accepted: string[] = [];
      const rejected: string[] = [];
      for (const recipient of [...new Set(recipients)]) {
        try { await session.command(`RCPT TO:<${recipient}>`,[250,251]);accepted.push(recipient); }
        catch { rejected.push(recipient); }
      }
      if (!accepted.length) throw new Error('SMTP server rejected every recipient');
      await session.data(buildMimeMessage(message));
      return {providerMessageKey:message.messageId,accepted,rejected};
    } finally {
      await session.close();
    }
  }
}
