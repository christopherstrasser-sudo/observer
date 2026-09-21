export interface GsiTeam {
  name?: string;
  score?: number;
  consecutive_round_losses?: number;
  timeouts_remaining?: number;
  matches_won_this_series?: number;
}

export interface GsiMap {
  mode?: string;
  name?: string;
  phase?: string;
  round?: number;
  team_ct?: GsiTeam;
  team_t?: GsiTeam;
  num_matches_to_win_series?: number;
}

export interface GsiPlayerState {
  health?: number;
  armor?: number;
  helmet?: boolean;
  defusekit?: boolean;
  flashed?: number;
  smoked?: number;
  burning?: number;
  money?: number;
  round_kills?: number;
  round_killhs?: number;
  equip_value?: number;
}

export interface GsiPlayer {
  steamid?: string;
  name?: string;
  observer_slot?: number;
  team?: "CT" | "T";
  activity?: string;
  state?: GsiPlayerState;
  weapons?: Record<string, {
    name?: string;
    paintkit?: string;
    type?: string;
    state?: string;
    ammo_clip?: number;
    ammo_clip_max?: number;
    ammo_reserve?: number;
  }>;
  match_stats?: {
    kills?: number;
    assists?: number;
    deaths?: number;
    mvps?: number;
    score?: number;
  };
}

export interface GsiPayload {
  auth?: {
    token?: string;
  };
  provider?: {
    name?: string;
    appid?: number;
    version?: number;
    steamid?: string;
    timestamp?: number;
  };
  map?: GsiMap;
  player?: GsiPlayer;
  allplayers?: Record<string, GsiPlayer>;
  round?: {
    phase?: string;
    win_team?: "CT" | "T";
    bomb?: string;
  };
  bomb?: {
    state?: string;
    position?: string;
    player?: string;
    countdown?: string;
  };
  phase_countdowns?: {
    phase?: string;
    phase_ends_in?: string;
  };
}

export interface BroadcastState {
  gsi: GsiPayload | null;
  lastGsiAt: number | null;
  packetsReceived: number;
  rejectedPackets: number;
  lastGsiSource: string | null;
  serverStartedAt: number;
}
