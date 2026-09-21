export interface UserInfo {
  id: number;
  username: string;
  display_name: string;
  avatar_color?: string | null;
  map_style?: string | null;
}

export interface MemberDeviceLocation {
  entity_id: string;
  device_name: string;
  latitude: number;
  longitude: number;
  battery?: number | string | null;
  accuracy?: number | null;
  last_updated: string;
}

export interface CircleMember {
  id: number;
  username: string;
  display_name: string;
  avatar_color?: string | null;
  devices: MemberDeviceLocation[];
}

export interface Circle {
  id: number;
  name: string;
  owner_id: number;
  invite_code: string;
  created_at: string;
}
