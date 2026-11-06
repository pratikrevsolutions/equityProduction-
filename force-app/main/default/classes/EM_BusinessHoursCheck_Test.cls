@IsTest
private class EM_BusinessHoursCheck_Test {
    private static EM_BusinessHoursCheck.Request req(String name, Datetime at) {
        EM_BusinessHoursCheck.Request r = new EM_BusinessHoursCheck.Request();
        r.businessHoursName = name;
        r.atTime = at;
        return r;
    }

    @IsTest
    static void matchesPlatformResultForKnownHours() {
        BusinessHours bh = [SELECT Id, Name FROM BusinessHours WHERE IsDefault = true LIMIT 1];
        Datetime now = Datetime.now();
        List<EM_BusinessHoursCheck.Result> res = EM_BusinessHoursCheck.check(new List<EM_BusinessHoursCheck.Request>{ req(bh.Name, now) });
        Assert.areEqual(BusinessHours.isWithin(bh.Id, now), res[0].withinHours);
    }

    @IsTest
    static void unknownOrBlankHoursCountAsWithin() {
        List<EM_BusinessHoursCheck.Result> res = EM_BusinessHoursCheck.check(new List<EM_BusinessHoursCheck.Request>{
            req('No Such Hours', Datetime.now()),
            req(null, Datetime.now()),
            req('No Such Hours', null)
        });
        Assert.isTrue(res[0].withinHours);
        Assert.isTrue(res[1].withinHours);
        Assert.isTrue(res[2].withinHours);
    }
}