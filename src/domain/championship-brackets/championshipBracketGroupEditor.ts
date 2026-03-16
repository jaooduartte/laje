export interface ChampionshipBracketGroupEditorSlot {
  slot_id: string;
  team_id: string | null;
  available_team_ids: string[];
  is_removable: boolean;
}

export interface ChampionshipBracketGroupEditorColumn {
  group_number: number;
  available_team_ids: string[];
  slots: ChampionshipBracketGroupEditorSlot[];
}

export type ChampionshipBracketGroupOrderedTeamIdsByGroupNumber = Record<string, string[]>;
export type ChampionshipBracketGroupEditorTransientSlotIdsByGroupNumber = Record<string, string[]>;

interface SanitizeGroupAssignmentsParams {
  participant_team_ids: string[];
  group_assignments: Record<string, number>;
  groups_count: number;
}

interface ResolveGroupEditorColumnsParams extends SanitizeGroupAssignmentsParams {
  ordered_team_ids_by_group_number: ChampionshipBracketGroupOrderedTeamIdsByGroupNumber;
  transient_slot_ids_by_group_number: ChampionshipBracketGroupEditorTransientSlotIdsByGroupNumber;
}

function resolveUniqueTeamIds(team_ids: string[]): string[] {
  return [...new Set(team_ids)];
}

function resolveAvailableTeamIds(
  participant_team_ids: string[],
  group_assignments: Record<string, number>,
  current_team_id: string | null,
): string[] {
  const selected_team_id_set = new Set(
    Object.keys(group_assignments).filter((team_id) => team_id != current_team_id && group_assignments[team_id] >= 1),
  );

  return participant_team_ids.filter((team_id) => !selected_team_id_set.has(team_id));
}

export function resolveOrderedAssignedTeamIds(params: {
  participant_team_ids: string[];
  group_assignments: Record<string, number>;
  ordered_team_ids_by_group_number: ChampionshipBracketGroupOrderedTeamIdsByGroupNumber;
  group_number: number;
}): string[] {
  const uniqueParticipantTeamIds = resolveUniqueTeamIds(params.participant_team_ids);
  const assignedTeamIds = uniqueParticipantTeamIds.filter((team_id) => params.group_assignments[team_id] == params.group_number);
  const assignedTeamIdSet = new Set(assignedTeamIds);
  const orderedAssignedTeamIds = (params.ordered_team_ids_by_group_number[String(params.group_number)] ?? []).filter(
    (team_id, team_index, currentOrderedTeamIds) => {
      return assignedTeamIdSet.has(team_id) && currentOrderedTeamIds.indexOf(team_id) == team_index;
    },
  );
  const orderedAssignedTeamIdSet = new Set(orderedAssignedTeamIds);

  return [...orderedAssignedTeamIds, ...assignedTeamIds.filter((team_id) => !orderedAssignedTeamIdSet.has(team_id))];
}

export function sanitizeGroupAssignments({
  participant_team_ids,
  group_assignments,
  groups_count,
}: SanitizeGroupAssignmentsParams): Record<string, number> {
  const next_group_assignments: Record<string, number> = {};
  const participant_team_id_set = new Set(resolveUniqueTeamIds(participant_team_ids));
  const safe_groups_count = Math.max(1, groups_count);

  Object.entries(group_assignments).forEach(([team_id, group_number]) => {
    if (!participant_team_id_set.has(team_id)) {
      return;
    }

    if (typeof group_number != "number" || Number.isNaN(group_number)) {
      return;
    }

    const normalized_group_number = Math.trunc(group_number);

    if (normalized_group_number < 1 || normalized_group_number > safe_groups_count) {
      return;
    }

    next_group_assignments[team_id] = normalized_group_number;
  });

  return next_group_assignments;
}

export function sanitizeGroupOrderedTeamIdsByGroupNumber(params: {
  participant_team_ids: string[];
  group_assignments: Record<string, number>;
  groups_count: number;
  ordered_team_ids_by_group_number: ChampionshipBracketGroupOrderedTeamIdsByGroupNumber;
}): ChampionshipBracketGroupOrderedTeamIdsByGroupNumber {
  const uniqueParticipantTeamIds = resolveUniqueTeamIds(params.participant_team_ids);
  const sanitizedGroupAssignments = sanitizeGroupAssignments({
    participant_team_ids: uniqueParticipantTeamIds,
    group_assignments: params.group_assignments,
    groups_count: params.groups_count,
  });
  const safeGroupsCount = Math.max(1, params.groups_count);

  return Array.from({ length: safeGroupsCount }, (_, groupIndex) => {
    const groupNumber = groupIndex + 1;
    const orderedAssignedTeamIds = resolveOrderedAssignedTeamIds({
      participant_team_ids: uniqueParticipantTeamIds,
      group_assignments: sanitizedGroupAssignments,
      ordered_team_ids_by_group_number: params.ordered_team_ids_by_group_number,
      group_number: groupNumber,
    });

    return [String(groupNumber), orderedAssignedTeamIds] as const;
  }).reduce<ChampionshipBracketGroupOrderedTeamIdsByGroupNumber>((carry, [groupNumber, orderedAssignedTeamIds]) => {
    if (orderedAssignedTeamIds.length == 0) {
      return carry;
    }

    carry[groupNumber] = orderedAssignedTeamIds;
    return carry;
  }, {});
}

export function resolveGroupEditorColumns({
  participant_team_ids,
  group_assignments,
  groups_count,
  ordered_team_ids_by_group_number,
  transient_slot_ids_by_group_number,
}: ResolveGroupEditorColumnsParams): ChampionshipBracketGroupEditorColumn[] {
  const unique_participant_team_ids = resolveUniqueTeamIds(participant_team_ids);
  const sanitized_group_assignments = sanitizeGroupAssignments({
    participant_team_ids: unique_participant_team_ids,
    group_assignments,
    groups_count,
  });
  const safe_groups_count = Math.max(1, groups_count);

  return Array.from({ length: safe_groups_count }, (_, group_index) => {
    const group_number = group_index + 1;
    const assigned_team_ids = resolveOrderedAssignedTeamIds({
      participant_team_ids: unique_participant_team_ids,
      group_assignments: sanitized_group_assignments,
      ordered_team_ids_by_group_number,
      group_number,
    });
    const available_team_ids = resolveAvailableTeamIds(unique_participant_team_ids, sanitized_group_assignments, null);
    const slots: ChampionshipBracketGroupEditorSlot[] = assigned_team_ids.map((team_id) => ({
      slot_id: `assigned::${team_id}`,
      team_id,
      available_team_ids: resolveAvailableTeamIds(unique_participant_team_ids, sanitized_group_assignments, team_id),
      is_removable: true,
    }));

    (transient_slot_ids_by_group_number[String(group_number)] ?? []).forEach((slot_id) => {
      slots.push({
        slot_id,
        team_id: null,
        available_team_ids,
        is_removable: true,
      });
    });

    if (slots.length == 0) {
      slots.push({
        slot_id: `empty::${group_number}`,
        team_id: null,
        available_team_ids,
        is_removable: false,
      });
    }

    return {
      group_number,
      available_team_ids,
      slots,
    };
  });
}
