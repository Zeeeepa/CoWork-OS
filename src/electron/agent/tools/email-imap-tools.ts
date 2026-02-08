import Database from 'better-sqlite3';
import { AgentDaemon } from '../daemon';
import { LLMTool } from '../llm/types';
import { ChannelRepository } from '../../database/repositories';
import { EmailClient } from '../../gateway/channels/email-client';

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export class EmailImapTools {
  private channelRepo: ChannelRepository;

  constructor(
    private db: Database.Database,
    private daemon: AgentDaemon,
    private taskId: string
  ) {
    this.channelRepo = new ChannelRepository(db);
  }

  isAvailable(): boolean {
    const channel = this.channelRepo.findByType('email');
    if (!channel) return false;
    if (!channel.enabled) return false;

    const cfg = channel.config as any;
    return (
      typeof cfg === 'object' &&
      cfg !== null &&
      typeof cfg.imapHost === 'string' &&
      typeof cfg.smtpHost === 'string' &&
      typeof cfg.email === 'string' &&
      typeof cfg.password === 'string'
    );
  }

  static getToolDefinitions(): LLMTool[] {
    return [
      {
        name: 'email_imap_unread',
        description:
          'Fetch unread emails directly from the configured Email (IMAP) channel mailbox. ' +
          'Does not mark messages as read. Useful when Google Workspace (gmail_action) is unavailable.',
        input_schema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Max number of unread messages to return (default: 20, max: 50)',
            },
            mailbox: {
              type: 'string',
              description:
                'Mailbox/folder to query (default: channel config mailbox, usually "INBOX")',
            },
            max_body_chars: {
              type: 'number',
              description:
                'Max characters of body text to include per email (default: 1000, max: 5000)',
            },
          },
          required: [],
        },
      },
    ];
  }

  async listUnread(input: {
    limit?: unknown;
    mailbox?: unknown;
    max_body_chars?: unknown;
  }): Promise<any> {
    const limitRaw = asNumber(input?.limit);
    const limit = Math.min(Math.max(limitRaw ?? 20, 1), 50);
    const mailboxOverride = asNonEmptyString(input?.mailbox);
    const maxBodyCharsRaw = asNumber(input?.max_body_chars);
    const maxBodyChars = Math.min(Math.max(maxBodyCharsRaw ?? 1000, 0), 5000);

    this.daemon.logEvent(this.taskId, 'tool_call', {
      tool: 'email_imap_unread',
      limit,
      mailbox: mailboxOverride || undefined,
      max_body_chars: maxBodyChars,
    });

    const channel = this.channelRepo.findByType('email');
    if (!channel) {
      return {
        success: false,
        error: 'Email channel is not configured. Configure it in Settings > Channels > Email.',
      };
    }

    if (!channel.enabled) {
      return {
        success: false,
        error:
          'Email channel is configured but disabled. Enable it in Settings > Channels > Email.',
      };
    }

    const cfg = channel.config as any;
    const imapHost = asNonEmptyString(cfg?.imapHost);
    const smtpHost = asNonEmptyString(cfg?.smtpHost);
    const email = asNonEmptyString(cfg?.email);
    const password = asNonEmptyString(cfg?.password);

    if (!imapHost || !smtpHost || !email || !password) {
      return {
        success: false,
        error:
          'Email channel is missing required IMAP/SMTP configuration (imapHost/smtpHost/email/password). Check Settings > Channels > Email.',
      };
    }

    const imapPort = asNumber(cfg?.imapPort) ?? 993;
    const imapSecure = asBoolean(cfg?.imapSecure) ?? true;
    const smtpPort = asNumber(cfg?.smtpPort) ?? 587;
    const smtpSecure = asBoolean(cfg?.smtpSecure) ?? false;
    const displayName = asNonEmptyString(cfg?.displayName) || undefined;
    const mailbox = mailboxOverride ?? asNonEmptyString(cfg?.mailbox) ?? 'INBOX';

    const client = new EmailClient({
      imapHost,
      imapPort,
      imapSecure,
      smtpHost,
      smtpPort,
      smtpSecure,
      email,
      password,
      displayName,
      mailbox,
      pollInterval: 30000,
      verbose: process.env.NODE_ENV === 'development',
    });

    const messages = await client.fetchUnreadEmails(limit);

    return {
      success: true,
      account: email,
      mailbox,
      unread: messages.length,
      messages: messages.map((m) => {
        const body = typeof m.text === 'string' ? m.text : '';
        const snippet =
          maxBodyChars <= 0
            ? undefined
            : (body.length > maxBodyChars ? body.slice(0, maxBodyChars) + '...' : body) || undefined;
        return {
          uid: m.uid,
          message_id: m.messageId,
          from: m.from,
          subject: m.subject,
          date: m.date instanceof Date ? m.date.toISOString() : String(m.date),
          is_read: m.isRead,
          ...(snippet ? { snippet } : {}),
        };
      }),
    };
  }
}

