export type CompletionShell = 'bash' | 'zsh' | 'fish';

const bashCompletion = `# bash completion for spoti
_spoti_completion() {
  local cur command
  cur="\${COMP_WORDS[COMP_CWORD]}"
  command="\${COMP_WORDS[1]}"

  local commands="setup login logout status config interactive now open launch lyrics pause resume next previous device seek restart volume queue shuffle repeat album artist playlists playlist-create playlist-edit playlist-move add playlist liked like unlike recent top tt ta update search play completion i p pa r np ly q s vol devices dev devs pl pls rep rec n prev sk rst app alb art"
  local global_options="-h --help -V --version"

  if (( COMP_CWORD == 1 )); then
    COMPREPLY=( $(compgen -W "$commands $global_options" -- "$cur") )
    return
  fi

  case "$command" in
    config)
      if (( COMP_CWORD == 2 )); then
        COMPREPLY=( $(compgen -W "get set reset path unset -h --help" -- "$cur") )
      elif (( COMP_CWORD == 3 )) && [[ "\${COMP_WORDS[2]}" == get || "\${COMP_WORDS[2]}" == set || "\${COMP_WORDS[2]}" == unset ]]; then
        COMPREPLY=( $(compgen -W "spotifyClientId defaultDevice watchAfterPlay refreshIntervalMs" -- "$cur") )
      elif (( COMP_CWORD == 4 )) && [[ "\${COMP_WORDS[2]}" == set && "\${COMP_WORDS[3]}" == watchAfterPlay ]]; then
        COMPREPLY=( $(compgen -W "true false" -- "$cur") )
      fi
      ;;
    completion)
      COMPREPLY=( $(compgen -W "bash zsh fish -h --help" -- "$cur") )
      ;;
    now|np)
      COMPREPLY=( $(compgen -W "-w --watch --short -h --help" -- "$cur") )
      ;;
    queue|q|album|alb|artist|art|playlist|pl|lyrics|ly)
      COMPREPLY=( $(compgen -W "--first -h --help" -- "$cur") )
      ;;
    add)
      COMPREPLY=( $(compgen -W "--search --first -h --help" -- "$cur") )
      ;;
    playlist-create)
      COMPREPLY=( $(compgen -W "--public -h --help" -- "$cur") )
      ;;
    playlist-edit)
      COMPREPLY=( $(compgen -W "--name --description --public --private -h --help" -- "$cur") )
      ;;
    playlist-move)
      COMPREPLY=( $(compgen -W "-h --help" -- "$cur") )
      ;;
    playlists|pls|liked|recent|rec|search|s)
      COMPREPLY=( $(compgen -W "-l --limit -h --help" -- "$cur") )
      ;;
    top)
      COMPREPLY=( $(compgen -W "tracks artists --range -r --limit -l -h --help" -- "$cur") )
      ;;
    tt|ta)
      COMPREPLY=( $(compgen -W "--range -r --limit -l -h --help" -- "$cur") )
      ;;
    device|devices|dev|devs)
      COMPREPLY=( $(compgen -W "--default -h --help" -- "$cur") )
      ;;
    update)
      COMPREPLY=( $(compgen -W "--check -h --help" -- "$cur") )
      ;;
    play|p)
      COMPREPLY=( $(compgen -W "track album artist playlist --first --watch --no-watch -h --help" -- "$cur") )
      ;;
    shuffle)
      COMPREPLY=( $(compgen -W "on off -h --help" -- "$cur") )
      ;;
    repeat|rep)
      COMPREPLY=( $(compgen -W "off track context -h --help" -- "$cur") )
      ;;
    *)
      COMPREPLY=( $(compgen -W "-h --help" -- "$cur") )
      ;;
  esac
}

complete -F _spoti_completion spoti
`;

const zshCompletion = `#compdef spoti
# zsh completion for spoti

_spoti() {
  local context state line
  local -a commands
  commands=(
    'setup:save your Spotify application client ID'
    'login:log in to Spotify'
    'logout:remove locally stored Spotify credentials'
    'status:show authentication status'
    'config:view and update spoti configuration'
    'interactive:open the interactive spoti TUI'
    'now:show the current Spotify playback'
    'open:open the current track in Spotify'
    'launch:open the local Spotify app'
    'lyrics:show lyrics for the current track or a searched track'
    'pause:pause playback'
    'resume:resume playback'
    'next:skip to the next track'
    'previous:return to the previous track'
    'device:list Spotify Connect devices or transfer playback to one'
    'seek:seek within the current track'
    'sk:alias for seek'
    'restart:restart the current track from the beginning'
    'rst:alias for restart'
    'volume:show, set, or adjust the active device volume'
    'queue:show the playback queue or add a searched track'
    'shuffle:show or change the playback shuffle state'
    'repeat:show or change the playback repeat mode'
    'album:search for and show an album'
    'alb:alias for album'
    'artist:search for and show an artist'
    'art:alias for artist'
    'playlists:browse and optionally play your Spotify playlists'
    'playlist-create:create a Spotify playlist'
    'playlist-edit:edit the details of a playlist you own'
    'playlist-move:move a track within a playlist you own'
    'add:add the current or a searched track to a playlist'
    'playlist:show one of your Spotify playlists'
    'liked:browse and optionally play your liked tracks'
    'like:add the current track to your Spotify library'
    'unlike:remove the current track from your Spotify library'
    'recent:browse and optionally play recently played tracks'
    'top:browse and optionally play your top tracks or artists'
    'tt:browse and optionally play your top tracks'
    'ta:browse and optionally play your top artists'
    'update:check for or install the latest spoti version'
    'search:search Spotify tracks'
    'play:play a track, album, artist, or playlist'
    'completion:print a static shell completion script'
    'i:alias for interactive'
    'app:alias for launch'
    'p:alias for play'
    'pa:alias for pause'
    'r:alias for resume'
    'np:alias for now'
    'ly:alias for lyrics'
    'q:alias for queue'
    's:alias for search'
    'vol:alias for volume'
    'dev:alias for device'
    'devices:alias for device'
    'devs:alias for device'
    'pl:alias for playlist'
    'pls:alias for playlists'
    'rep:alias for repeat'
    'rec:alias for recent'
    'n:alias for next'
    'prev:alias for previous'
  )

  _arguments -C \\
    '(-h --help)'{-h,--help}'[display help]' \\
    '(-V --version)'{-V,--version}'[display version]' \
    '1:command:->command' \
    '*::argument:->arguments'

  case "$state" in
    command)
      _describe 'spoti command' commands
      ;;
    arguments)
      case "$words[2]" in
        config)
          local -a config_commands
          config_commands=(
            'get:read a configuration value'
            'set:set a configuration value'
            'reset:reset configuration to defaults'
            'path:show the configuration file path'
            'unset:remove a configuration value'
          )
          if (( CURRENT == 3 )); then
            _describe 'config command' config_commands
          elif [[ "$words[3]" == get || "$words[3]" == set || "$words[3]" == unset ]]; then
            _values 'configuration key' spotifyClientId defaultDevice watchAfterPlay refreshIntervalMs
          fi
          ;;
        completion)
          _values 'shell' bash zsh fish
          ;;
        now|np)
          _arguments '(-w --watch)'{-w,--watch}'[continuously refresh playback information]' '--short[print one compact line]'
          ;;
        queue|q|album|alb|artist|art|playlist|pl|lyrics|ly)
          _arguments '--first[select the first result without prompting]' '*:query:'
          ;;
        add)
          _arguments '--search[search for a track to add]:query:' '--first[select first matches without prompting]' '*:playlist:'
          ;;
        playlist-create)
          _arguments '--public[make the playlist public]' '1:playlist name:'
          ;;
        playlist-edit)
          _arguments '--name[set the playlist name]:name:' '--description[set the playlist description]:description:' '(--public --private)'--public[make the playlist public]' '(--public --private)'--private[make the playlist private]' '*:playlist:'
          ;;
        playlist-move)
          _arguments '1:playlist:' '2:current position:' '3:new position:'
          ;;
        playlists|pls|liked|recent|rec)
          _arguments '(-l --limit)'{-l,--limit}'[number of items per page]:number:'
          ;;
        top)
          _arguments '1:type:(tracks artists)' '(-r --range)'{-r,--range}'[short, medium, or long term]:range:(short medium long)' '(-l --limit)'{-l,--limit}'[number of items per page]:number:'
          ;;
        tt|ta)
          _arguments '(-r --range)'{-r,--range}'[short, medium, or long term]:range:(short medium long)' '(-l --limit)'{-l,--limit}'[number of items per page]:number:'
          ;;
        search|s)
          _arguments '(-l --limit)'{-l,--limit}'[maximum number of results]:number:' '*:query:'
          ;;
        device|devices|dev|devs)
          _arguments '--default[save this device as the playback fallback]' '*:device:'
          ;;
        update)
          _arguments '--check[check without installing]'
          ;;
        play|p)
          _arguments '--first[play the first result without prompting]' '--watch[continuously refresh playback information]' '--no-watch[return after starting playback]' '1:type:(track album artist playlist)' '*:query:'
          ;;
        shuffle)
          _values 'shuffle state' on off
          ;;
        repeat|rep)
          _values 'repeat mode' off track context
          ;;
      esac
      ;;
  esac
}

_spoti "$@"
`;

const fishCompletion = `# fish completion for spoti
complete -c spoti -f
complete -c spoti -s h -l help -d 'Display help'
complete -c spoti -s V -l version -d 'Display version'

function __spoti_needs_command
  not __fish_seen_subcommand_from setup login logout status config interactive now open launch lyrics pause resume next previous device devices seek restart volume queue shuffle repeat album artist playlists playlist-create playlist-edit playlist-move add playlist liked like unlike recent top tt ta update search play completion i p pa r np ly q s vol dev devs pl pls rep rec n prev sk rst app alb art
end
complete -c spoti -n __spoti_needs_command -a setup -d 'Save your Spotify application client ID'
complete -c spoti -n __spoti_needs_command -a login -d 'Log in to Spotify'
complete -c spoti -n __spoti_needs_command -a logout -d 'Remove locally stored Spotify credentials'
complete -c spoti -n __spoti_needs_command -a status -d 'Show authentication status'
complete -c spoti -n __spoti_needs_command -a config -d 'View and update configuration'
complete -c spoti -n __spoti_needs_command -a interactive -d 'Open the interactive spoti TUI'
complete -c spoti -n __spoti_needs_command -a now -d 'Show current playback'
complete -c spoti -n __spoti_needs_command -a open -d 'Open the current track in Spotify'
complete -c spoti -n __spoti_needs_command -a launch -d 'Open the local Spotify app'
complete -c spoti -n __spoti_needs_command -a lyrics -d 'Show lyrics for the current or a searched track'
complete -c spoti -n __spoti_needs_command -a pause -d 'Pause playback'
complete -c spoti -n __spoti_needs_command -a resume -d 'Resume playback'
complete -c spoti -n __spoti_needs_command -a next -d 'Skip to the next track'
complete -c spoti -n __spoti_needs_command -a previous -d 'Return to the previous track'
complete -c spoti -n __spoti_needs_command -a device -d 'List devices or transfer playback to one'
complete -c spoti -n __spoti_needs_command -a seek -d 'Seek within the current track'
complete -c spoti -n __spoti_needs_command -a restart -d 'Restart the current track from the beginning'
complete -c spoti -n __spoti_needs_command -a volume -d 'Show, set, or adjust volume'
complete -c spoti -n __spoti_needs_command -a queue -d 'Show or add to the queue'
complete -c spoti -n __spoti_needs_command -a shuffle -d 'Show or change playback shuffle state'
complete -c spoti -n __spoti_needs_command -a repeat -d 'Show or change playback repeat mode'
complete -c spoti -n __spoti_needs_command -a album -d 'Search for an album'
complete -c spoti -n __spoti_needs_command -a artist -d 'Search for an artist'
complete -c spoti -n __spoti_needs_command -a playlists -d 'Browse and optionally play your playlists'
complete -c spoti -n __spoti_needs_command -a playlist-create -d 'Create a Spotify playlist'
complete -c spoti -n __spoti_needs_command -a playlist-edit -d 'Edit the details of a playlist you own'
complete -c spoti -n __spoti_needs_command -a playlist-move -d 'Move a track within a playlist you own'
complete -c spoti -n __spoti_needs_command -a add -d 'Add the current or a searched track to a playlist'
complete -c spoti -n __spoti_needs_command -a playlist -d 'Show a playlist'
complete -c spoti -n __spoti_needs_command -a liked -d 'Browse and optionally play liked tracks'
complete -c spoti -n __spoti_needs_command -a like -d 'Like the current track'
complete -c spoti -n __spoti_needs_command -a unlike -d 'Unlike the current track'
complete -c spoti -n __spoti_needs_command -a recent -d 'Browse and optionally play recently played tracks'
complete -c spoti -n __spoti_needs_command -a top -d 'Browse and optionally play your top tracks or artists'
complete -c spoti -n __spoti_needs_command -a tt -d 'Browse and optionally play your top tracks'
complete -c spoti -n __spoti_needs_command -a ta -d 'Browse and optionally play your top artists'
complete -c spoti -n __spoti_needs_command -a update -d 'Check for or install updates'
complete -c spoti -n __spoti_needs_command -a search -d 'Search Spotify tracks'
complete -c spoti -n __spoti_needs_command -a play -d 'Play a track, album, artist, or playlist'
complete -c spoti -n __spoti_needs_command -a completion -d 'Print a shell completion script'
complete -c spoti -n __spoti_needs_command -a 'i app p pa r np ly q s vol dev devices devs pl pls rep rec n prev sk rst alb art tt ta' -d 'Command alias'

complete -c spoti -n '__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from get set reset path unset' -a 'get set reset path unset'
complete -c spoti -n '__fish_seen_subcommand_from config; and __fish_seen_subcommand_from get set unset' -a 'spotifyClientId defaultDevice watchAfterPlay refreshIntervalMs'
complete -c spoti -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish'
complete -c spoti -n '__fish_seen_subcommand_from now np' -s w -l watch -d 'Continuously refresh playback information'
complete -c spoti -n '__fish_seen_subcommand_from now np' -l short -d 'Print one compact line'
complete -c spoti -n '__fish_seen_subcommand_from queue q album alb artist art playlist pl' -l first -d 'Select the first result without prompting'
complete -c spoti -n '__fish_seen_subcommand_from add' -l first -d 'Select first matches without prompting'
complete -c spoti -n '__fish_seen_subcommand_from add' -l search -r -d 'Search for a track to add'
complete -c spoti -n '__fish_seen_subcommand_from playlist-create' -l public -d 'Make the playlist public'
complete -c spoti -n '__fish_seen_subcommand_from playlist-edit' -l name -r -d 'Set the playlist name'
complete -c spoti -n '__fish_seen_subcommand_from playlist-edit' -l description -r -d 'Set the playlist description'
complete -c spoti -n '__fish_seen_subcommand_from playlist-edit' -l public -d 'Make the playlist public'
complete -c spoti -n '__fish_seen_subcommand_from playlist-edit' -l private -d 'Make the playlist private'
complete -c spoti -n '__fish_seen_subcommand_from playlists pls liked recent rec' -s l -l limit -r -d 'Number of items per page'
complete -c spoti -n '__fish_seen_subcommand_from search s' -s l -l limit -r -d 'Maximum number of results'
complete -c spoti -n '__fish_seen_subcommand_from top' -a 'tracks artists'
complete -c spoti -n '__fish_seen_subcommand_from top' -s r -l range -r -d 'short, medium, or long term'
complete -c spoti -n '__fish_seen_subcommand_from top' -s l -l limit -r -d 'Number of items per page'
complete -c spoti -n '__fish_seen_subcommand_from tt ta' -s r -l range -r -d 'short, medium, or long term'
complete -c spoti -n '__fish_seen_subcommand_from tt ta' -s l -l limit -r -d 'Number of items per page'
complete -c spoti -n '__fish_seen_subcommand_from device devices dev devs' -l default -d 'Save this device as the playback fallback'
complete -c spoti -n '__fish_seen_subcommand_from update' -l check -d 'Check without installing'
complete -c spoti -n '__fish_seen_subcommand_from play p' -l first -d 'Play the first result without prompting'
complete -c spoti -n '__fish_seen_subcommand_from play p' -l watch -d 'Continuously refresh playback information'
complete -c spoti -n '__fish_seen_subcommand_from play p' -l no-watch -d 'Return after starting playback'
complete -c spoti -n '__fish_seen_subcommand_from play p' -a 'track album artist playlist'
complete -c spoti -n '__fish_seen_subcommand_from shuffle' -a 'on off'
complete -c spoti -n '__fish_seen_subcommand_from repeat rep' -a 'off track context'
`;

/** Return a self-contained completion definition without running the spoti CLI. */
export function generateCompletionScript(shell: CompletionShell): string {
  switch (shell) {
    case 'bash':
      return bashCompletion;
    case 'zsh':
      return zshCompletion;
    case 'fish':
      return fishCompletion;
    default:
      throw new Error(`Unsupported shell: ${String(shell)}`);
  }
}
