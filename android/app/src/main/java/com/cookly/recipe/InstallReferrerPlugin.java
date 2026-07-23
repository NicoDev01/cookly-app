package com.cookly.recipe;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.android.installreferrer.api.ReferrerDetails;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "InstallReferrer")
public class InstallReferrerPlugin extends Plugin {
    @PluginMethod
    public void get(PluginCall call) {
        InstallReferrerClient client = InstallReferrerClient.newBuilder(getContext()).build();
        client.startConnection(new InstallReferrerStateListener() {
            @Override
            public void onInstallReferrerSetupFinished(int responseCode) {
                if (responseCode != InstallReferrerClient.InstallReferrerResponse.OK) {
                    client.endConnection();
                    call.reject("INSTALL_REFERRER_UNAVAILABLE", Integer.toString(responseCode));
                    return;
                }
                try {
                    ReferrerDetails details = client.getInstallReferrer();
                    JSObject result = new JSObject();
                    result.put("referrer", details.getInstallReferrer());
                    result.put("clickAt", details.getReferrerClickTimestampSeconds() * 1000);
                    result.put("installAt", details.getInstallBeginTimestampSeconds() * 1000);
                    result.put("instantExperience", details.getGooglePlayInstantParam());
                    call.resolve(result);
                } catch (Exception error) {
                    call.reject("INSTALL_REFERRER_FAILED", error);
                } finally {
                    client.endConnection();
                }
            }

            @Override
            public void onInstallReferrerServiceDisconnected() {
                call.reject("INSTALL_REFERRER_DISCONNECTED");
            }
        });
    }
}
