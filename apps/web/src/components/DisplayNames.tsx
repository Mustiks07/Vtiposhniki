import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { conversationTitle, profileLabel } from '../lib/presentation';

/** Shared queries resolve opaque references without changing their URL or identity. */
export function ConversationName({ id, revision }: { id: string; revision: number }) {
  const query = useQuery({ queryKey: ['conversation', id, revision], queryFn: ({ signal }) => api.getConversation(id, revision, signal), staleTime: Infinity });
  return <>{query.data ? conversationTitle(query.data) : query.isError ? 'Разговор недоступен' : 'Разговор с клиентом'}</>;
}

export function ChecklistName({ id }: { id: string }) {
  const query = useQuery({ queryKey: ['checklist-version', id], queryFn: ({ signal }) => api.getChecklistVersion(id, signal), staleTime: Infinity });
  return <>{query.data?.title ?? 'Закреплённый чек-лист'}</>;
}

export function ProfileName({ id, version }: { id: string; version: string }) {
  const query = useQuery({ queryKey: ['profiles'], queryFn: ({ signal }) => api.listProfiles(signal), staleTime: 60_000 });
  const profile = query.data?.items.find((p) => p.profile.id === id && p.profile.version === version)?.profile;
  return <>{profile ? profileLabel(profile) : 'Сохранённый профиль оценщика'}</>;
}
