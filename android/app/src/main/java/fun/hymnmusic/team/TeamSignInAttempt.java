package fun.hymnmusic.team;

/** A completed/cancelled provider callback must never replace a newer attempt. */
final class TeamSignInAttempt {
    enum Phase { IDLE, GOOGLE, TOKEN_EXCHANGE, WORKSPACE }
    private int sequence;
    private Phase phase=Phase.IDLE;
    synchronized int begin(){if(phase!=Phase.IDLE)return -1;phase=Phase.GOOGLE;return ++sequence;}
    synchronized boolean current(int id){return id==sequence&&phase!=Phase.IDLE;}
    synchronized boolean waitingForGoogle(int id){return current(id)&&phase==Phase.GOOGLE;}
    synchronized boolean advance(int id,Phase next){if(!current(id)||next.ordinal()<=phase.ordinal())return false;phase=next;return true;}
    synchronized Phase phase(){return phase;}
    synchronized void finish(){phase=Phase.IDLE;sequence++;}
}
