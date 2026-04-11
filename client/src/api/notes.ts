import { api } from './index';

export interface NoteResponse {
  content: string;
  html: string;
}

export interface SaveNoteResponse {
  html: string;
}

export const notesApi = {
  get: (symbol: string) =>
    api.get<NoteResponse>(`/stocks/${symbol}/note`),

  save: (symbol: string, content: string) =>
    api.put<SaveNoteResponse>(`/stocks/${symbol}/note`, { content }),

  uploadImage: async (symbol: string, blob: Blob): Promise<number> => {
    const res = await fetch(`/api/stocks/${symbol}/images`, {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'image/png' },
      body: blob,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? res.statusText);
    }
    const data = await res.json();
    return data.id as number;
  },
};
