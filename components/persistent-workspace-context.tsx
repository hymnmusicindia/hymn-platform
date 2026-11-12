"use client";
import { createContext } from 'react';
import type { StudioFrameView } from './hymn-studio-frame';
export type StudioFrameConfiguration = Omit<Parameters<typeof StudioFrameView<string>>[0], 'children'>;
export const StudioFrameContext = createContext<{register: (configuration: StudioFrameConfiguration) => () => void} | null>(null);
export const PersistentWorkspaceContext = createContext(false);
