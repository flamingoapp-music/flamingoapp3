(function ($) {

	// ======================
	//   Setup / Variables
	// ======================
	var $window = $(window),
		$body = $('body'),
		$wrapper = $('#wrapper'),
		$header = $('#header'),
		$banner = $('#banner');

	// Respeta la preferencia del usuario para reducir movimiento
	const REDUCE_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	// Breakpoints.
	breakpoints({
		xlarge: ['1281px', '1680px'],
		large: ['981px', '1280px'],
		medium: ['737px', '980px'],
		small: ['481px', '736px'],
		xsmall: ['361px', '480px'],
		xxsmall: [null, '360px']
	});

	/**
	 * Parallax con throttling (rAF) y respeto por reduced motion.
	 * @return {jQuery} jQuery object.
	 */
	$.fn._parallax = (
		browser.name == 'ie' ||
		browser.name == 'edge' ||
		browser.mobile ||
		REDUCE_MOTION
	) ? function () { return $(this) } : function (intensity) {

		var $this = $(this);
		if (this.length === 0 || intensity === 0) return $this;

		if (this.length > 1) {
			for (var i = 0; i < this.length; i++) $(this[i])._parallax(intensity);
			return $this;
		}

		if (!intensity) intensity = 0.25;

		$this.each(function () {
			var $t = $(this),
				on, off,
				ticking = false,
				scrollHandler;

			on = function () {
				// Estado inicial
				$t.css('background-position', 'center 100%, center 100%, center 0px');

				// Throttle con rAF y listener pasivo nativo
				scrollHandler = function () {
					if (ticking) return;
					ticking = true;
					requestAnimationFrame(function () {
						var pos = (window.pageYOffset || document.documentElement.scrollTop) - parseInt($t.position().top, 10);
						$t[0].style.backgroundPosition = 'center ' + (pos * (-1 * intensity)) + 'px';
						ticking = false;
					});
				};

				// Usamos addEventListener para tener {passive:true}
				window.addEventListener('scroll', scrollHandler, { passive: true });
				// Trigger inicial
				scrollHandler();
			};

			off = function () {
				$t.css('background-position', '');
				if (scrollHandler) {
					window.removeEventListener('scroll', scrollHandler, { passive: true });
					scrollHandler = null;
				}
			};

			breakpoints.on('<=medium', off);
			breakpoints.on('>medium', on);
		});

		// Recalcular en load/resize
		$window
			.off('load._parallax resize._parallax')
			.on('load._parallax resize._parallax', function () {
				$window.trigger('scroll');
			});

		return $(this);
	};

	// Play initial animations on page load.
	$window.on('load', function () {
		window.setTimeout(function () {
			$body.removeClass('is-preload');
		}, 100);
	});

	// Clear transitioning state on unload/hide.
	$window.on('unload pagehide', function () {
		window.setTimeout(function () {
			$('.is-transitioning').removeClass('is-transitioning');
		}, 250);
	});

	// IE/Edge tweaks.
	if (browser.name == 'ie' || browser.name == 'edge')
		$body.addClass('is-ie');

	// Scrolly (offset dinámico por altura del header)
	$('.scrolly').scrolly({
		offset: function () {
			return $header.height() - 2;
		}
	});

	// Tiles.
	var $tiles = $('.tiles > article');
	$tiles.each(function () {
		var $this = $(this),
			$image = $this.find('.image'), $img = $image.find('img'),
			$link = $this.find('.link'),
			x;

		// Image -> set como background para evitar layout shift
		if ($img.length) {
			var src = $img.attr('src');
			if (src) $this.css('background-image', 'url(' + src + ')');

			// Set position si viene en data-position
			if (x = $img.data('position')) $image.css('background-position', x);

			// Oculta img original
			$image.hide();
		}

		// Link.
		if ($link.length > 0) {
			var $x = $link.clone()
				.text('')
				.addClass('primary')
				.appendTo($this);

			$link = $link.add($x);

			$link.on('click', function (event) {
				var href = $link.attr('href');

				// Prevent default.
				event.stopPropagation();
				event.preventDefault();

				// Target blank?
				if ($link.attr('target') == '_blank') {
					window.open(href);
				} else {
					// Transition
					$this.addClass('is-transitioning');
					$wrapper.addClass('is-transitioning');

					// Redirect.
					window.setTimeout(function () {
						location.href = href;
					}, 500);
				}
			});
		}
	});

	// Header behavior for scroll (scrollex)
	if ($banner.length > 0 && $header.hasClass('banner-header') && !REDUCE_MOTION) {
		$window.on('resize', function () {
			$window.trigger('scroll');
		});

		$window.on('load', function () {
			$banner.scrollex({
				bottom: $header.outerHeight() + 10,
				terminate: function () { $header.removeClass('alt reveal'); },
				enter: function () { $header.addClass('alt').removeClass('reveal'); },
				leave: function () { $header.removeClass('alt').addClass('reveal'); }
			});

			window.setTimeout(function () {
				$window.triggerHandler('scroll');
			}, 100);
		});
	}

	// Banner (parallax + background image)
	$banner.each(function () {
		var $this = $(this),
			$image = $this.find('.image'), $img = $image.find('img');

		// Parallax (respetando reduced motion)
		$this._parallax(0.275);

		// Imagen como background
		if ($image.length > 0 && $img.length) {
			var src = $img.attr('src');
			if (src) $this.css('background-image', 'url(' + src + ')');
			$image.hide();
		}
	});

	// Menu.
	var $menu = $('#menu'), $menuInner;

	$menu.wrapInner('<div class="inner"></div>');
	$menuInner = $menu.children('.inner');
	$menu._locked = false;

	$menu._lock = function () {
		if ($menu._locked) return false;
		$menu._locked = true;
		window.setTimeout(function () { $menu._locked = false; }, 350);
		return true;
	};

	$menu._show = function () {
		if ($menu._lock()) $body.addClass('is-menu-visible');
	};

	$menu._hide = function () {
		if ($menu._lock()) $body.removeClass('is-menu-visible');
	};

	$menu._toggle = function () {
		if ($menu._lock()) $body.toggleClass('is-menu-visible');
	};

	$menuInner
		.on('click', function (event) { event.stopPropagation(); })
		.on('click', 'a', function (event) {
			var href = $(this).attr('href');
			event.preventDefault();
			event.stopPropagation();

			// Hide.
			$menu._hide();

			// Redirect.
			window.setTimeout(function () {
				window.location.href = href;
			}, 250);
		});

	$menu
		.appendTo($body)
		.on('click', function (event) {
			event.stopPropagation();
			event.preventDefault();
			$body.removeClass('is-menu-visible');
		})
		.append('<a class="close" href="#menu">Close</a>');

	$body
		.on('click', 'a[href="#menu"]', function (event) {
			event.stopPropagation();
			event.preventDefault();
			$menu._toggle();
		})
		.on('click', function () {
			$menu._hide();
		})
		.on('keydown', function (event) {
			if (event.keyCode == 27) $menu._hide();
		});

})(jQuery);


// =====================================================
//   Dropdown "CHARTS" (mejora: inicia oculto + toggle)
// =====================================================
$(function () {
	const $chartsItem = $('nav ul li:contains("CHARTS")');
	const $chartsLink = $chartsItem.children('a');
	const $chartsDropdown = $chartsItem.children('ul');

	let chartsOpen = false;

	// Oculto inicialmente
	$chartsDropdown.hide();

	$chartsLink.on('click', function (e) {
		e.preventDefault();
		chartsOpen = !chartsOpen;
		if (chartsOpen) {
			$chartsDropdown.stop(true, true).slideDown(200);
		} else {
			$chartsDropdown.stop(true, true).slideUp(200);
		}
	});

	// Cerrar si se hace clic fuera del menú
	$(document).on('click', function (e) {
		if (!$chartsItem.is(e.target) && $chartsItem.has(e.target).length === 0) {
			$chartsDropdown.stop(true, true).slideUp(200);
			chartsOpen = false;
		}
	});
});
