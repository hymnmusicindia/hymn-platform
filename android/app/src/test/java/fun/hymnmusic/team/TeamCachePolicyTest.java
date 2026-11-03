package fun.hymnmusic.team;
import org.junit.Test;
import static org.junit.Assert.*;
public class TeamCachePolicyTest {
    @Test public void taskSaveKeepsUnrelatedPeopleAndProjectsWarm(){assertTrue(TeamCachePolicy.affected("workstation-save","workstation"));assertTrue(TeamCachePolicy.affected("workstation-finish","calendar"));assertFalse(TeamCachePolicy.affected("workstation-save","members"));assertFalse(TeamCachePolicy.affected("workstation-save","projects"));}
    @Test public void alertsAndUnknownWritesRemainSafe(){assertTrue(TeamCachePolicy.affected("notifications-read","notifications"));assertFalse(TeamCachePolicy.affected("notifications-read","tasks"));assertTrue(TeamCachePolicy.affected("unknown-write","members"));}
}
