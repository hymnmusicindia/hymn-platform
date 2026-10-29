import React from 'react';
import { createRoot } from 'react-dom/client';
import { UserLibrary } from '../../components/user-library';
const assets = Array.from({ length: 24 }, (_, index) => ({ id: index + 1, originalFilename: index === 0 ? 'Only Feelings.wav' : `Master ${String(index + 1).padStart(2, '0')}.wav`, safeFilename: `master-${index + 1}.wav`, audioUrl: `/api/assets/${index + 1}/download?filename=master-${index + 1}.wav`, mimeType: 'audio/wav', byteSize: 34000000, createdAt: new Date(Date.UTC(2026, 9, 28 - index)).toISOString(), released: index === 0, coverArtUrl: null }));
const purchases = [{ id: 2, userId: 1, beatId: 3, beatTitle: 'Tairna', producerName: 'gxrry.flac', licenseType: 'mp3' as const, purchasedAt: '2026-10-29T09:00:00Z', licenseUrl: '/licenses/2', hasAccess: true, createdAt: '2026-10-29', updatedAt: '2026-10-29' }];
const params = new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(<UserLibrary assets={assets} purchases={purchases} initialView={params.get('view') === 'purchases' ? 'purchases' : 'all'} errors={{ files: false, purchases: params.has('error') }}/>);
