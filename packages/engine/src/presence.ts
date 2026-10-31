export interface Member {
  id: string;
  name: string;
}

// Room membership, kept pure so the server stays a thin transport layer.
export class Presence {
  private readonly rooms = new Map<string, Map<string, Member>>();

  join(room: string, member: Member): Member[] {
    let members = this.rooms.get(room);
    if (!members) {
      members = new Map();
      this.rooms.set(room, members);
    }
    members.set(member.id, member);
    return this.list(room);
  }

  leave(room: string, id: string): Member[] {
    const members = this.rooms.get(room);
    if (!members) return [];
    members.delete(id);
    if (members.size === 0) this.rooms.delete(room);
    return this.list(room);
  }

  list(room: string): Member[] {
    return [...(this.rooms.get(room)?.values() ?? [])];
  }
}
