import { TeamError } from './policy';

export const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export type Planning = { weeklyHours: number | null; skills: string[]; near: number; overloaded: number };
export function planning(value: unknown): Planning {
  const config = object(object(value).operations);
  return { weeklyHours: typeof config.weeklyHours === 'number' && config.weeklyHours >= 0 ? config.weeklyHours : null, skills: Array.isArray(config.skills) ? config.skills.filter((v): v is string => typeof v === 'string') : [], near: typeof config.near === 'number' ? config.near : 80, overloaded: typeof config.overloaded === 'number' ? config.overloaded : 100 };
}
export function remainingHours(value: unknown) {
  const hours = object(object(value).operations).remainingHours;
  return typeof hours === 'number' && Number.isFinite(hours) && hours >= 0 ? hours : null;
}
export function capacity(hours: number, missing: number, available: number | null, config: Pick<Planning, 'near' | 'overloaded'>) {
  if (missing || available === null) return { percent: null, state: 'Incomplete data' };
  if (available === 0) return { percent: null, state: hours ? 'No capacity' : 'No planned capacity' };
  const percent = Math.round(hours / available * 100);
  return { percent, state: percent > config.overloaded ? 'Overloaded' : percent >= config.near ? 'Near capacity' : percent < 50 ? 'Available capacity' : 'Balanced' };
}
export function ownerOperations(actor: { role: { owner: boolean } }) {
  if (!actor.role.owner) throw new TeamError('Workspace owner access is required for operations planning.', 403);
}
