"use strict";

var Backbone = require('../../shim/backbone'),
    _ = require('underscore');

var UserModel = Backbone.Model.extend({
    defaults: {
        itsi: false,
        guest: true
    },

    url: '/user/login',

    // Both login and logout methods return jqXHR objects so that callbacks can
    // be specified upon usage. They both update the user model, so any event
    // listeners that subscribe to the `sync` event will be triggered.
    login: function(attrs) {
        return this.fetch({
            type: 'POST',
            url: '/user/login',
            data: {
                'username': attrs.username,
                'password': attrs.password
            }
        });
    },

    logout: function() {
        var jqXHR = this.fetch({
            url: '/user/logout'
        });

        var user = this;
        jqXHR.done(function() {
            // We have to unset the username manually here because when the
            // server does not return a username (because the user has been
            // logged out), our model's username is not updated and the old
            // username persists.
            // Additionally, we change this silently because the login and
            // logout functions only advertise firing a single `sync` event,
            // and this would fire an additional `change` event. We must
            // suppress this to maintain consistency in our API.
            user.unset('username', {silent: true});
        });

        return jqXHR;
    },

    loggedInUserMatch: function(user_id) {
        return user_id > 0 && this.userMatch(user_id);
    },

    userMatch: function(user_id) {
        return user_id === this.id;
    }
});

var ModalBaseModel = Backbone.Model.extend({
    defaults: {
        success: false,
        client_errors: null,
        server_errors: null
    }
});

var LoginFormModel = ModalBaseModel.extend({
    defaults: {
        username: null,
        password: null,
        successCallback: null
    },

    url: '/user/login',

    validate: function(attrs) {
        var errors = [];

        if (!attrs.username) {
            errors.push('Please enter a username');
        }

        if (!attrs.password) {
            errors.push('Please enter a password');
        }

        if (errors.length) {
            this.set({
                'client_errors': errors,
                'server_errors': null
            });
            return errors;
        } else {
            this.set({
                'client_errors': null,
                'server_errors': null
            });
        }
    },

    onSuccess: function() {
        var callback = this.get('successCallback');
        if (callback && _.isFunction(callback)) {
            callback();
        }
    }
});

var SignUpFormModel = ModalBaseModel.extend({
    defaults: {
        username: null,
        password1: null,
        password2: null,
        email: null,
        showItsiButton: true
    },

    url: '/user/sign_up',

    validate: function(attrs) {
        var errors = [];

        if (!attrs.username) {
            errors.push('Please enter a username');
        }

        if (!attrs.email) {
            errors.push('Please enter an email address');
        }

        if (!attrs.password1) {
            errors.push('Please enter a password');
        }

        if (!attrs.password2) {
            errors.push('Please repeat the password');
        }

        if (attrs.password1 !== attrs.password2) {
            errors.push('Passwords do not match');
        }

        if (errors.length) {
            this.set({
                'client_errors': errors,
                'server_errors': null
            });
            return errors;
        } else {
            this.set({
                'client_errors': null,
                'server_errors': null
            });
        }
    }
});

var ForgotFormModel = ModalBaseModel.extend({
    defaults: {
        username: false,
        password: false,
        email: null
    },

    url: '/user/forgot',

    validate: function(attrs) {
        var errors = [];

        if (!attrs.email) {
            errors.push('Please enter an email address');
        }

        if (!attrs.username && !attrs.password) {
            errors.push('Please check user name and/or password');
        }

        if (errors.length) {
            this.set({
                'client_errors': errors,
                'server_errors': null
            });
            return errors;
        } else {
            this.set({
                'client_errors': null,
                'server_errors': null
            });
        }
    }
});

var ResendFormModel = ModalBaseModel.extend({
    defaults: {
        email: null
    },

    url: '/user/resend',

    validate: function(attrs) {
        var errors = [];

        if (!attrs.email) {
            errors.push('Please enter an email address');
        }

        if (errors.length) {
            this.set({
                'client_errors': errors,
                'server_errors': null
            });
            return errors;
        } else {
            this.set({
                'client_errors': null,
                'server_errors': null
            });
        }
    }
});

var ChangePasswordFormModel = ModalBaseModel.extend({
    defaults: {
        old_password: null,
        new_password1: null,
        new_password2: null
    },

    url: '/user/change-password',

    validate: function(attrs) {
        var errors = [];

        if (!attrs.old_password) {
            errors.push('Please enter your password');
        }

        if (!attrs.new_password1) {
            errors.push('Please enter a password');
        }

        if (!attrs.new_password2) {
            errors.push('Please repeat the password');
        }

        if (attrs.new_password1 !== attrs.new_password2) {
            errors.push('Passwords do not match');
        }

        if (errors.length) {
            this.set({
                'client_errors': errors,
                'server_errors': null
            });
            return errors;
        } else {
            this.set({
                'client_errors': null,
                'server_errors': null
            });
        }
    }
});

var ItsiSignUpFormModel = ModalBaseModel.extend({
    defaults: {
        username: null,
        first_name: null,
        last_name: null,
        next: '/'
    },

    url: '/user/itsi/sign_up',

    validate: function(attrs) {
        var errors = [];

        if (!attrs.username) {
            errors.push('Please enter a username');
        }

        if (!attrs.first_name) {
            errors.push('Please enter a first name');
        }

        if (!attrs.last_name) {
            errors.push('Please enter a last name');
        }

        if (errors.length) {
            this.set({
                'client_errors': errors,
                'server_errors': null
            });
            return errors;
        } else {
            this.set({
                'client_errors': null,
                'server_errors': null
            });
        }
    }
});

module.exports = {
    UserModel: UserModel,
    LoginFormModel: LoginFormModel,
    SignUpFormModel: SignUpFormModel,
    ResendFormModel: ResendFormModel,
    ForgotFormModel: ForgotFormModel,
    ChangePasswordFormModel: ChangePasswordFormModel,
    ItsiSignUpFormModel: ItsiSignUpFormModel
};
