/**
 * Flow action: is a moment inside a team's business hours (EM NY Hours / EM KYTN Hours)?
 * Unknown or blank business hours name counts as inside hours, so a missing setup never marks
 * every call as after hours.
 */
public with sharing class EM_BusinessHoursCheck {
    public class Request {
        @InvocableVariable(label='Business Hours Name' required=true)
        public String businessHoursName;
        @InvocableVariable(label='Moment' required=true)
        public Datetime atTime;
    }

    public class Result {
        @InvocableVariable(label='Within Business Hours')
        public Boolean withinHours;
    }

    @InvocableMethod(label='EM Is Within Business Hours' description='True when the moment falls inside the named business hours.')
    public static List<Result> check(List<Request> requests) {
        Set<String> names = new Set<String>();
        for (Request r : requests) {
            if (String.isNotBlank(r.businessHoursName)) names.add(r.businessHoursName);
        }
        Map<String, Id> byName = new Map<String, Id>();
        for (BusinessHours bh : [SELECT Id, Name FROM BusinessHours WHERE Name IN :names AND IsActive = true]) {
            byName.put(bh.Name, bh.Id);
        }
        List<Result> results = new List<Result>();
        for (Request r : requests) {
            Result res = new Result();
            Id bhId = byName.get(r.businessHoursName);
            res.withinHours = (bhId == null || r.atTime == null) ? true : BusinessHours.isWithin(bhId, r.atTime);
            results.add(res);
        }
        return results;
    }
}