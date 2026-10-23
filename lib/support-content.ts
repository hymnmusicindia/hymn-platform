import type { SupportTicket } from './types';

export function supportTemplate(ticket: Pick<SupportTicket, 'id' | 'subject'>, kind: string) {
  return {
    subject: `${kind === 'missed-call' ? 'Let us arrange another call' : 'An update on your support request'} | HYMN #${ticket.id}`,
    body: kind === 'missed-call'
      ? `Hi,\n\nWe tried calling you about "${ticket.subject}", but you were unavailable at that time. Kindly reschedule the call using the callback option in your HYMN support ticket. Let us know a convenient time and we will arrange another attempt.\n\nBest,\nHYMN Support`
      : `Hi,\n\nThank you for contacting HYMN about "${ticket.subject}".\n\n[Add the solution and any steps the customer should take here.]\n\nIf you still need help, open your support ticket in HYMN.\n\nBest,\nHYMN Support`
  };
}
