/*global describe, it, expect*/

var buster = require("buster");
var robohydra = require("../lib/robohydra"),
    RoboHydra = robohydra.RoboHydra,
    Request   = robohydra.Request,
    Response  = robohydra.Response;
var RoboHydraHeadStatic = require("../lib/heads").RoboHydraHeadStatic;
var helpers          = require("./helpers"),
    pluginInfoObject = helpers.pluginInfoObject,
    withResponse     = helpers.withResponse;

buster.spec.expose();

function registerSimplePlugin(robohydra, props) {
    var scenarios = {};
    props.scenarios.forEach(function(scenarioName) {
        scenarios[scenarioName] = {heads: [
            new RoboHydraHeadStatic({
                name: scenarioName,
                content: "Content for scenario " + scenarioName
            })
        ]};
    });

    robohydra.registerPluginObject(pluginInfoObject({
        name: props.name,
        heads: props.heads.map(function(headName) {
            return new RoboHydraHeadStatic({
                name: headName,
                content: "Content for " + headName
            });
        }),
        scenarios: scenarios
    }));
}

describe("Admin RoboHydra UI", function() {
    "use strict";

    it("shows up by default on /robohydra-admin", function(done) {
        var robohydra = new RoboHydra();

        var req = new Request({url: '/robohydra-admin'});
        var res = new Response(function() {
            expect(res.statusCode).toEqual(200);
            var res2 = new Response(function() {
                expect(res2.statusCode).toEqual(404);
                done();
            });
            robohydra.handle({url: '/blah'}, res2);
        });
        robohydra.handle(req, res);
    });

    it("shows the plugin & head names on the front page", function(done) {
        var robohydra = new RoboHydra();
        var pluginName = 'plugin1', headName = 'some-head-name';
        robohydra.registerPluginObject(pluginInfoObject({
            name: pluginName,
            heads: [new RoboHydraHeadStatic({name: headName, content: 'foo'})]
        }));

        var req = new Request({url: '/robohydra-admin'});
        var res = new Response(function() {
            expect(this.body).toMatch(pluginName);
            expect(this.body).toMatch(headName);
            expect(this.body).toMatch(/RoboHydra Admin/);
            done();
        });
        robohydra.handle(req, res);
    });
});



function restUrl(path) {
    return '/robohydra-admin/rest' + path;
}

describe("REST API", function() {
    "use strict";

    it("shows information for the given plugin", function(done) {
        var robohydra = new RoboHydra();
        var pluginName = 'plugin1', headName = 'some-head-name',
            headName2 = 'some-other-head-name';
        registerSimplePlugin(robohydra, {
            name: pluginName,
            heads: [headName, headName2],
            scenarios: ['oneAndOnlyScenario']
        });

        var url = restUrl('/plugins/' + pluginName);
        withResponse(robohydra, url, function(resp) {
            expect(resp.statusCode).toEqual(200);
            var info = JSON.parse(resp.body.toString());
            expect(info.name).toEqual(pluginName);
            expect(info.heads).toEqual([
                {plugin: pluginName,
                 name: headName,
                 attached: true},
                {plugin: pluginName,
                 name: headName2,
                 attached: true}
            ]);
            expect(info.scenarios).toEqual([
                {plugin: pluginName,
                 name: 'oneAndOnlyScenario',
                 active: false}
            ]);
            done();
        });
    });

    it("updates scenario state when a scenario starts", function(done) {
        var robohydra = new RoboHydra();
        var pluginName = 'plugin1', headName = 'some-head-name',
            headName2 = 'some-other-head-name', scenarioName = 'firstScenario',
            scenarioName2 = 'secondScenario';
        registerSimplePlugin(robohydra, {
            name: pluginName,
            heads: [headName, headName2],
            scenarios: [scenarioName, scenarioName2]
        });
        robohydra.startScenario(pluginName, 'firstScenario');

        var url = restUrl('/plugins/' + pluginName);
        withResponse(robohydra, url, function(resp) {
            var initialInfo = JSON.parse(resp.body.toString());
            expect(initialInfo.scenarios).toEqual([
                {plugin: pluginName,
                 name: 'firstScenario',
                 active: true},
                {plugin: pluginName,
                 name: 'secondScenario',
                 active: false}
            ]);

            robohydra.startScenario(pluginName, 'secondScenario');
            withResponse(robohydra, url, function(resp) {
                var updatedInfo = JSON.parse(resp.body.toString());
                expect(updatedInfo.scenarios).toEqual([
                    {plugin: pluginName,
                     name: 'firstScenario',
                     active: false},
                    {plugin: pluginName,
                     name: 'secondScenario',
                     active: true}
                ]);
                done();
            });
        });
    });

    it("shows information for the given head", function(done) {
        var robohydra = new RoboHydra();
        var pluginName = 'plugin1', headName = 'some-head-name';
        robohydra.registerPluginObject(pluginInfoObject({
            name: pluginName,
            heads: [new RoboHydraHeadStatic({name: headName, content: 'foo'})]
        }));

        var url = restUrl('/plugins/' + pluginName + '/heads/' + headName);
        withResponse(robohydra, url, function(resp) {
            expect(resp.statusCode).toEqual(200);
            var info = JSON.parse(resp.body.toString());
            expect(info.plugin).toEqual(pluginName);
            expect(info.name).toEqual(headName);
            done();
        });
    });

    it("can toggle the state of a head", function(done) {
        var robohydra = new RoboHydra();
        var pluginName = 'plugin1', headName = 'some-head-name';
        robohydra.registerPluginObject(pluginInfoObject({
            name: pluginName,
            heads: [new RoboHydraHeadStatic({name: headName, content: 'foo'})]
        }));

        var headUrl = restUrl('/plugins/' + pluginName + '/heads/' + headName);
        var detachRequest = {path: headUrl,
                             method: 'POST',
                             postData: 'attached=false'};
        withResponse(robohydra, detachRequest, function(detachResp) {
            expect(detachResp.statusCode).toEqual(200);
            var detachInfo = JSON.parse(detachResp.body.toString());
            expect(detachInfo.plugin).toEqual(pluginName);
            expect(detachInfo.name).toEqual(headName);
            expect(detachInfo.attached).toEqual(false);

            withResponse(robohydra, headUrl, function(afterResp) {
                var afterInfo = JSON.parse(afterResp.body.toString());
                expect(afterInfo.plugin).toEqual(pluginName);
                expect(afterInfo.name).toEqual(headName);
                expect(afterInfo.attached).toEqual(false);
                done();
            });
        });
    });
});
