/*!
 * ${copyright}
 */
sap.ui.require([
	"sap/ui/model/Model",
	"sap/ui/model/odata/v4/ODataContextBinding",
	"sap/ui/model/odata/v4/ODataListBinding",
	"sap/ui/model/odata/v4/ODataModel",
	"sap/ui/model/odata/v4/ODataPropertyBinding"
], function (Model, ODataContextBinding, ODataListBinding, ODataModel, ODataPropertyBinding) {
	/*global odatajs, QUnit, sinon */
	/*eslint no-warning-comments: 0 */
	"use strict";

	/*
	 * You can run various tests in this module against a real OData v4 service. Set the system
	 * property "com.sap.ui5.proxy.REMOTE_LOCATION" to a server containing the Gateway test
	 * service "/sap/opu/local_v4/IWBEP/TEA_BUSI" and load the page with the request property
	 * "realOData=true".
	 */

	var mFixture = {
			"/sap/opu/local_v4/IWBEP/TEA_BUSI/TEAMS('TEAM_01')/Name": "Name.json",
			"/sap/opu/local_v4/IWBEP/TEA_BUSI/TEAMS('UNKNOWN')": [404, "TEAMS('UNKNOWN').json"]
		},
		bRealOData = jQuery.sap.getUriParameters().get("realOData") === "true",
		TestControl = sap.ui.core.Element.extend("TestControl", {
			metadata: {
				properties: {
					text: "string"
				}
			}
		});

	/**
	 * Prepare Sinon fake server for the given fixture.
	 *
	 * @param {string} sBase
	 *   The base URI for the response files.
	 * @param {object} mFixture
	 *   The fixture with the URLs to fake as keys and the URIs of the fake responses (relative to
	 *   sBase) as values. The content type is determined from the response file's extension.
	 */
	function setupFakeServer(sBase, mFixture) {
		var iCode,
			mHeaders,
			sMessage,
			vResponse,
			oServer,
			sSource,
			sUrl,
			mUrls = {};

		function contentType(sName) {
			if (/\.xml$/.test(sName)) {
				return "application/xml";
			}
			if (/\.json$/.test(sName)) {
				return "application/json";
			}
			return "application/x-octet-stream";
		}

		for (sUrl in mFixture) {
			vResponse = mFixture[sUrl];
			if (typeof vResponse === "number") {
				iCode = vResponse;
				sMessage = "";
				mHeaders = {};
			} else {
				if (typeof vResponse === "string") {
					iCode = 200;
					sSource = vResponse;
				} else {
					iCode = vResponse[0];
					sSource = vResponse[1];
				}
				sSource = sBase + '/' + sSource;
				sMessage = jQuery.sap.syncGetText(sSource, "", null);
				mHeaders = {"Content-Type": contentType(sSource)};
			}
			mUrls[sUrl] = [iCode, mHeaders, sMessage];
		}

		//TODO remove this workaround in IE9 for
		// https://github.com/cjohansen/Sinon.JS/commit/e8de34b5ec92b622ef76267a6dce12674fee6a73
		sinon.xhr.supportsCORS = true;

		oServer = sinon.fakeServer.create();
		sinon.FakeXMLHttpRequest.useFilters = true;
		sinon.FakeXMLHttpRequest.addFilter(function (sMethod, sUrl, bAsync) {
			return !(sUrl in mFixture); // do not fake if URL is unknown
		});

		for (sUrl in mUrls) {
			oServer.respondWith(sUrl, mUrls[sUrl]);
		}
		oServer.autoRespond = true;
	}

	if (!bRealOData) {
		setupFakeServer("data", mFixture);
	}

	/**
	 * Gets the correct service URL. Adjusts it in case of <code>bRealOData</code>, so that it is
	 * passed through the proxy.
	 *
	 * @param {string} sUrl the URL
	 * @returns {string} the adjusted URL
	 */
	function getServiceUrl(sUrl) {
		if (bRealOData) {
			sUrl = "../../../../../../../proxy" + sUrl;
		}
		return sUrl;
	}

	/**
	 * Creates a v4 OData service for <code>TEA_BUSI</code>.
	 *
	 * @returns {sap.ui.model.odata.v4.oDataModel} the model
	 */
	function createModel() {
		return new ODataModel(getServiceUrl("/sap/opu/local_v4/IWBEP/TEA_BUSI"));
	}

	//*********************************************************************************************
	QUnit.module("sap.ui.model.odata.v4.ODataModel", {
		beforeEach : function () {
			this.oSandbox = sinon.sandbox.create();
			this.oLogMock = this.oSandbox.mock(jQuery.sap.log);
			this.oLogMock.expects("warning").never();
			this.oLogMock.expects("error").never();
		},

		afterEach : function () {
			// I would consider this an API, see https://github.com/cjohansen/Sinon.JS/issues/614
			this.oSandbox.verifyAndRestore();
			sap.ui.getCore().getConfiguration().setLanguage(this.sDefaultLanguage);
		},

		sDefaultLanguage : sap.ui.getCore().getConfiguration().getLanguage()
	});

	//*********************************************************************************************
	QUnit.test("basics", function (assert) {
		assert.ok(new ODataModel("/foo") instanceof Model);
		assert.throws(function () {
			return new ODataModel();
		}, /Missing service URL/);
		assert.strictEqual(new ODataModel("/foo/").sServiceUrl, "/foo", "remove trailing /");
	});

	//*********************************************************************************************
	QUnit.test("Property access from ManagedObject w/o context binding", function (assert) {
		var oModel = createModel(),
			oControl = new TestControl({models: oModel}),
			done = assert.async();

		oControl.bindProperty("text", "/TEAMS('TEAM_01')/Name");
		// bindProperty creates an ODataPropertyBinding and calls its initialize which results in
		// checkUpdate and a request. The value is updated asynchronously via a change event later
		oControl.getBinding("text").attachChange(function () {
			assert.strictEqual(oControl.getText(), "Business Suite", "property value");
			done();
		});
	});

	//*********************************************************************************************
	QUnit.test("Property access from ManagedObject w/ context binding", function (assert) {
		var oModel = createModel(),
			oControl = new TestControl({models: oModel}),
			done = assert.async();

		oControl.bindObject("/TEAMS('TEAM_01')");
		oControl.bindProperty("text", "Name");
		// bindProperty creates an ODataPropertyBinding and calls its initialize which results in
		// checkUpdate and a request. The value is updated asynchronously via a change event later
		oControl.getBinding("text").attachChange(function () {
			assert.strictEqual(oControl.getText(), "Business Suite", "property value");
			done();
		});
	});

	//*********************************************************************************************
	QUnit.test("ODataModel.read: failure", function (assert) {
		var oModel = createModel();

		sap.ui.getCore().getConfiguration().setLanguage("en-US");
		this.oLogMock.expects("error")
			.withExactArgs(
				"The requested entity of type 'TEAM' cannot be accessed. It does not exist.",
				"read(" + getServiceUrl("/sap/opu/local_v4/IWBEP/TEA_BUSI/TEAMS('UNKNOWN')") + ")",
				"sap.ui.model.odata.v4.ODataModel");
		this.oSandbox.spy(odatajs.oData, "read");

		return oModel.read("/TEAMS('UNKNOWN')").then(function (oData) {
			assert.ok(false, "Unexpected success");
		}, function (oError) {
			assert.ok(oError instanceof Error);
			assert.strictEqual(odatajs.oData.read.args[0][0].headers["accept-language"], "en-US");
			assert.strictEqual(oError.error.code, "/IWBEP/CM_V4_APPS/002");
			assert.strictEqual(oError.message,
				"The requested entity of type 'TEAM' cannot be accessed. It does not exist.");
		});
	});

	//*********************************************************************************************
	QUnit.test("bindList", function (assert) {
		var oModel = new ODataModel("foo"),
			oContext = {},
			oBinding = oModel.bindList("/path", oContext);

		assert.ok(oBinding instanceof ODataListBinding);
		assert.strictEqual(oBinding.getModel(), oModel);
		assert.strictEqual(oBinding.getContext(), oContext);
		assert.strictEqual(oBinding.getPath(), "/path");
		assert.strictEqual(oBinding.iIndex, 0, "list binding unique index");
		assert.strictEqual(oModel.bindList("/path", oContext).iIndex, 1);
		assert.strictEqual(oModel.aLists[0], oBinding, "model stores list bindings");
		//TODO add further tests once exact behavior of bindList is clear
	});

	//*********************************************************************************************
	QUnit.test("read for list binding path uses ODataListBinding#readValue", function (assert) {
		var iIndex = Math.floor(Math.random() * 50), // some index
			oModel = createModel(),
			oListBinding = oModel.bindList("/TEAMS"),
			oResult = {};

		this.oSandbox.mock(oListBinding).expects("readValue").withExactArgs(iIndex, "foo/bar")
			.returns(Promise.resolve(oResult));
		this.oSandbox.mock(odatajs.oData).expects("read").never();

		return oModel.read("/TEAMS[" + iIndex + "];list=0/foo/bar").then(function (oData) {
			assert.deepEqual(oData, {value : oResult});
			assert.strictEqual(oData.value, oResult);
		});
	});

	//*********************************************************************************************
	QUnit.test("read for list binding path propagates ODataListBinding#readValue failure",
		function (assert) {
			var oModel = createModel(),
				oListBinding = oModel.bindList("/TEAMS"),
				oError = new Error("Intentionally failed");

			this.oSandbox.mock(oListBinding).expects("readValue").returns(Promise.reject(oError));
			this.oSandbox.mock(odatajs.oData).expects("read").never();

			return oModel.read("/TEAMS[0];list=0/foo/bar").then(
				function () { assert.ok(false, "Unexpected success"); },
				function (oError0) { assert.strictEqual(oError0, oError); }
			);
		}
	);

	// TODO constructor: sDefaultBindingMode, mSupportedBindingModes
	// TODO constructor: test that the service URL is absolute?
	// TODO read: support the mParameters context, urlParameters, filters, sorters, batchGroupId
	// TODO read: abort
});
