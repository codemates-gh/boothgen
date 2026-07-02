export const dynamic = 'force-dynamic';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Inbox, Mail, Phone, Calendar, Users, MessageSquare, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

const STATUS_COLORS: Record<string, string> = {
  NEW: 'text-blue-600 border-blue-200 bg-blue-50',
  CONTACTED: 'text-yellow-600 border-yellow-200 bg-yellow-50',
  QUOTED: 'text-purple-600 border-purple-200 bg-purple-50',
  CONVERTED: 'text-green-600 border-green-200 bg-green-50',
  CLOSED_LOST: 'text-gray-500 border-gray-200 bg-gray-50',
};
const STATUS_LABELS: Record<string, string> = {
  NEW: 'New', CONTACTED: 'Contacted', QUOTED: 'Quoted', CONVERTED: 'Converted', CLOSED_LOST: 'Closed Lost',
};

export default async function LeadsPage() {
  const session = await requireTenantSession();
  const leads = await prisma.leadSubmission.findMany({
    where: { tenantId: session.tenantId, status: { notIn: ['CONVERTED', 'CLOSED_LOST'] } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return (
    <>
      <TopBar title="Leads" />
      <div className="p-4 sm:p-8">
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-gray-500">{leads.length} inquiry{leads.length !== 1 ? 's' : ''}</p>
        </div>
        {leads.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4">
            <MessageSquare className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span>To send a message, open a lead and use the <strong className="text-gray-700">Compose</strong> tab.</span>
          </div>
        )}

        {leads.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              <Inbox className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No inquiries yet. They will appear here when someone fills out your lead capture form.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {leads.map(lead => (
              <Link key={lead.id} href={`/leads/${lead.id}`} className="block group">
                <Card className="transition-shadow group-hover:shadow-md">
                  <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-gray-900 group-hover:text-brand transition-colors">{lead.firstName} {lead.lastName}</h3>
                        <Badge variant="outline" className={STATUS_COLORS[lead.status] ?? STATUS_COLORS.NEW}>
                          {STATUS_LABELS[lead.status] ?? 'New'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-sm text-gray-600 mb-3">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <a href={`mailto:${lead.email}`} className="hover:text-brand truncate">{lead.email}</a>
                        </div>
                        {lead.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <a href={`tel:${lead.phone}`} className="hover:text-brand">{lead.phone}</a>
                          </div>
                        )}
                        {lead.eventDate && (
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span>{format(new Date(lead.eventDate), 'MMM d, yyyy')}</span>
                            {lead.eventType && <span className="text-gray-400">· {lead.eventType}</span>}
                          </div>
                        )}
                        {lead.guestCount && (
                          <div className="flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span>{lead.guestCount} guests</span>
                          </div>
                        )}
                      </div>

                      {lead.message && (
                        <div className="flex items-start gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                          <MessageSquare className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                          <p className="line-clamp-3">{lead.message}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-row sm:flex-col gap-2 sm:items-end shrink-0">
                      <p className="text-xs text-gray-400">{format(new Date(lead.createdAt), 'MMM d, yyyy h:mm a')}</p>
                      <span className="inline-flex items-center gap-1 text-xs text-brand font-medium">
                        Open <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
