@IsTest
private class EM_TeamTaskAssignee_Test {
    private static EM_TeamTaskAssignee.Request req(String queueName) {
        EM_TeamTaskAssignee.Request r = new EM_TeamTaskAssignee.Request();
        r.queueDeveloperName = queueName;
        return r;
    }

    private static User newUser(String alias) {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        return new User(Alias = alias, LastName = 'Recruiter ' + alias, Email = alias + '@example.com',
            Username = alias + '.' + Datetime.now().getTime() + '@em-test.example.com', ProfileId = p.Id,
            TimeZoneSidKey = 'America/New_York', LocaleSidKey = 'en_US', EmailEncodingKey = 'UTF-8', LanguageLocaleKey = 'en_US');
    }

    @IsTest
    static void picksMemberWithFewestOpenMissedCallTasks() {
        Group q = new Group(Name = 'EM Test Team', DeveloperName = 'EM_Test_Team_Queue', Type = 'Queue');
        User a = newUser('rcta');
        User b = newUser('rctb');
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert q;
            insert new List<User>{ a, b };
            insert new List<GroupMember>{
                new GroupMember(GroupId = q.Id, UserOrGroupId = a.Id),
                new GroupMember(GroupId = q.Id, UserOrGroupId = b.Id)
            };
        }
        insert new List<Task>{
            new Task(OwnerId = a.Id, Subject = 'Missed call: call back +15555550100', Status = 'Not Started'),
            new Task(OwnerId = a.Id, Subject = 'Missed call: call back +15555550101', Status = 'Not Started')
        };

        List<EM_TeamTaskAssignee.Result> res = EM_TeamTaskAssignee.pick(new List<EM_TeamTaskAssignee.Request>{ req('EM_Test_Team_Queue') });
        Assert.areEqual(b.Id, res[0].userId, 'The member with no open missed-call tasks gets the next one');
    }

    @IsTest
    static void returnsNullWithoutMembersOrQueue() {
        List<EM_TeamTaskAssignee.Result> res = EM_TeamTaskAssignee.pick(new List<EM_TeamTaskAssignee.Request>{ req('No_Such_Queue'), req(null) });
        Assert.isNull(res[0].userId);
        Assert.isNull(res[1].userId);
    }
}