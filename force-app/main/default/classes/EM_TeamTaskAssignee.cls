/**
 * Flow action: picks who on a team gets a call-back task for a missed call on a team line.
 * Spreads the work: the active member of the team queue with the fewest open "Missed call" tasks,
 * ties broken by name so the choice is stable. Returns null when the queue has no active user members.
 */
public with sharing class EM_TeamTaskAssignee {
    public class Request {
        @InvocableVariable(label='Team Queue Developer Name' required=true)
        public String queueDeveloperName;
    }

    public class Result {
        @InvocableVariable(label='Assignee User Id')
        public Id userId;
    }

    @InvocableMethod(label='EM Pick Team Member for Call-Back' description='Active team queue member with the fewest open missed-call tasks.')
    public static List<Result> pick(List<Request> requests) {
        List<Result> results = new List<Result>();
        for (Request r : requests) {
            Result res = new Result();
            res.userId = pickOne(r.queueDeveloperName);
            results.add(res);
        }
        return results;
    }

    private static Id pickOne(String queueDeveloperName) {
        if (String.isBlank(queueDeveloperName)) return null;
        Set<Id> memberIds = new Set<Id>();
        for (GroupMember m : [SELECT UserOrGroupId FROM GroupMember WHERE Group.DeveloperName = :queueDeveloperName AND Group.Type = 'Queue']) {
            if (m.UserOrGroupId.getSObjectType() == User.SObjectType) memberIds.add(m.UserOrGroupId);
        }
        List<User> members = [SELECT Id, Name FROM User WHERE Id IN :memberIds AND IsActive = true ORDER BY Name];
        if (members.isEmpty()) return null;

        Map<Id, Integer> open = new Map<Id, Integer>();
        for (User u : members) open.put(u.Id, 0);
        for (AggregateResult ar : [SELECT OwnerId o, COUNT(Id) n FROM Task
                                   WHERE OwnerId IN :open.keySet() AND IsClosed = false AND Subject LIKE 'Missed call%'
                                   GROUP BY OwnerId]) {
            open.put((Id) ar.get('o'), (Integer) ar.get('n'));
        }
        User best = members[0];
        for (User u : members) {
            if (open.get(u.Id) < open.get(best.Id)) best = u;
        }
        return best.Id;
    }
}