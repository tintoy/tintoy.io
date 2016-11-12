(function( $, window, undefined ) {
  // Menu
  $("a#slide").click(function(){
    $("#sidebar,a#slide,#fade").addClass("slide");
    $("#open").hide();
    $("#search").hide();
    $("#close").show();
  });

  $("#fade").click(function(){
    $("#sidebar,a#slide,#fade").removeClass("slide");
    $("#open").show();
    $("#search").show();
    $("#close").hide();
  });

  //Remove space scroll
  window.onkeydown = function(e) {
    if(e.keyCode == 32 && e.target == document.body) {
        e.preventDefault();
        return false;
    }
  };
  //Keys
  $(document).keydown(function(e){
    console.log(e.key);
    if(! $('.search-form').hasClass('active')){
      switch(e.key) {
        case " ":
          $('a#slide').trigger('click');
          $('')
          break;
        case "Esc":
          $('#fade').trigger('click');
          break;
      }
    } else {
      switch(e.key) {
        case "Esc":
          $('.icon-remove-sign').trigger('click');
          break;
      }
    }
    if($('#sidebar').hasClass('slide')){
      switch(e.key) {
        case "/":
          $('#fade').trigger('click');
          $("#search").trigger('click');
          e.preventDefault();
          break;
        default:
          if (/[a-z=]/.test(e.key)) {
            $("#sidebar ul li[data-shortcut='" + e.key +"'] a").trigger('click');
          }
          break;
      }
    }
  })
  // Search
  var bs = {
    close: $(".icon-remove-sign"),
    searchform: $(".search-form"),
    canvas: $("body"),
    dothis: $('.dosearch')
  };

  bs.dothis.on('click', function() {
    $('.search-wrapper').toggleClass('active');
    bs.searchform.toggleClass('active');
    bs.searchform.find('input').focus();
    bs.canvas.toggleClass('search-overlay');
    $('.search-field').simpleJekyllSearch();
  });

  bs.close.on('click', function() {
    $('.search-wrapper').toggleClass('active');
    bs.searchform.toggleClass('active');
    bs.canvas.removeClass('search-overlay');
  });

  // Scroll
  smoothScroll.init({
    updateURL: false
  })
})( Zepto, window );
