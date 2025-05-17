(function () {
    "use strict";

    function ScrollHelper(button) {
        var scrollHelper = this;

        this._button = button;

        var scrollPos = 0;
        document.addEventListener('scroll', function () {
            scrollPos = document.body.scrollTop;
        });

        function updateBtn() {
            if (scrollPos > 0) {
                scrollHelper.showButton();
            } else {
                scrollHelper.hideButton();
            }
            requestAnimationFrame(updateBtn);
        }

        updateBtn();
    }

    ScrollHelper.prototype.hideButton = function () {
        this._button.classList.add('hidden');
    };

    ScrollHelper.prototype.showButton = function () {
        this._button.classList.remove('hidden');
    };

    ScrollHelper.prototype.scrollToTheTop = function () {
        var scrollPos = document.body.scrollTop;

        if (scrollPos > 0) {
            document.body.scrollTop -= (scrollPos > 10) ? (scrollPos / 4) : 10;
            requestAnimationFrame(this.scrollToTheTop.bind(this));
        }
    };

    window.ScrollHelper = ScrollHelper;
})();
