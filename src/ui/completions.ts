export type CompletionShell = 'bash' | 'zsh' | 'fish';

const bashCompletion = `# bash completion for spoti
_spoti_completion() {
  local cur command
  cur="\${COMP_WORDS[COMP_CWORD]}"
  command="\${COMP_WORDS[1]}"

  local commands="setup login logout status config interactive now pause resume next previous devices device seek volume queue shuffle repeat album artist playlists playlist liked like unlike recent update search play completion i p pa r np q s vol dev devs pl pls rep rec n prev"
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
        COMPREPLY=( $(compgen -W "spotifyClientId watchAfterPlay refreshIntervalMs" -- "$cur") )
      elif (( COMP_CWORD == 4 )) && [[ "\${COMP_WORDS[2]}" == set && "\${COMP_WORDS[3]}" == watchAfterPlay ]]; then
        COMPREPLY=( $(compgen -W "true false" -- "$cur") )
      fi
      ;;
    completion)
      COMPREPLY=( $(compgen -W "bash zsh fish -h --help" -- "$cur") )
      ;;
    now|np)
      COMPREPLY=( $(compgen -W "-w --watch -h --help" -- "$cur") )
      ;;
    queue|q|album|artist|playlist|pl)
      COMPREPLY=( $(compgen -W "--first -h --help" -- "$cur") )
      ;;
    playlists|pls|liked|recent|rec|search|s)
      COMPREPLY=( $(compgen -W "-l --limit -h --help" -- "$cur") )
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
    'interactive:open the keyboard-driven Spotify search'
    'now:show the current Spotify playback'
    'pause:pause playback'
    'resume:resume playback'
    'next:skip to the next track'
    'previous:return to the previous track'
    'devices:list available Spotify Connect devices'
    'device:transfer playback to a Spotify Connect device'
    'seek:seek within the current track'
    'volume:set or adjust the active device volume'
    'queue:show the playback queue or add a searched track'
    'shuffle:turn playback shuffle on or off'
    'repeat:set the playback repeat mode'
    'album:search for and show an album'
    'artist:search for and show an artist'
    'playlists:list your Spotify playlists'
    'playlist:show one of your Spotify playlists'
    'liked:list your liked tracks'
    'like:add the current track to your Spotify library'
    'unlike:remove the current track from your Spotify library'
    'recent:show recently played tracks'
    'update:check for or install the latest spoti version'
    'search:search Spotify tracks'
    'play:play a track, album, artist, or playlist'
    'completion:print a static shell completion script'
    'i:alias for interactive'
    'p:alias for play'
    'pa:alias for pause'
    'r:alias for resume'
    'np:alias for now'
    'q:alias for queue'
    's:alias for search'
    'vol:alias for volume'
    'dev:alias for device'
    'devs:alias for devices'
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
            _values 'configuration key' spotifyClientId watchAfterPlay refreshIntervalMs
          fi
          ;;
        completion)
          _values 'shell' bash zsh fish
          ;;
        now|np)
          _arguments '(-w --watch)'{-w,--watch}'[continuously refresh playback information]'
          ;;
        queue|q|album|artist|playlist|pl)
          _arguments '--first[select the first result without prompting]' '*:query:'
          ;;
        playlists|pls|liked|recent|rec|search|s)
          _arguments '(-l --limit)'{-l,--limit}'[maximum number of results]:number:' '*:query:'
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
  not __fish_seen_subcommand_from setup login logout status config interactive now pause resume next previous devices device seek volume queue shuffle repeat album artist playlists playlist liked like unlike recent update search play completion i p pa r np q s vol dev devs pl pls rep rec n prev
end
complete -c spoti -n __spoti_needs_command -a setup -d 'Save your Spotify application client ID'
complete -c spoti -n __spoti_needs_command -a login -d 'Log in to Spotify'
complete -c spoti -n __spoti_needs_command -a logout -d 'Remove locally stored Spotify credentials'
complete -c spoti -n __spoti_needs_command -a status -d 'Show authentication status'
complete -c spoti -n __spoti_needs_command -a config -d 'View and update configuration'
complete -c spoti -n __spoti_needs_command -a interactive -d 'Open the keyboard-driven Spotify search'
complete -c spoti -n __spoti_needs_command -a now -d 'Show current playback'
complete -c spoti -n __spoti_needs_command -a pause -d 'Pause playback'
complete -c spoti -n __spoti_needs_command -a resume -d 'Resume playback'
complete -c spoti -n __spoti_needs_command -a next -d 'Skip to the next track'
complete -c spoti -n __spoti_needs_command -a previous -d 'Return to the previous track'
complete -c spoti -n __spoti_needs_command -a devices -d 'List Spotify Connect devices'
complete -c spoti -n __spoti_needs_command -a device -d 'Transfer playback to a device'
complete -c spoti -n __spoti_needs_command -a seek -d 'Seek within the current track'
complete -c spoti -n __spoti_needs_command -a volume -d 'Set or adjust volume'
complete -c spoti -n __spoti_needs_command -a queue -d 'Show or add to the queue'
complete -c spoti -n __spoti_needs_command -a shuffle -d 'Turn shuffle on or off'
complete -c spoti -n __spoti_needs_command -a repeat -d 'Set repeat mode'
complete -c spoti -n __spoti_needs_command -a album -d 'Search for an album'
complete -c spoti -n __spoti_needs_command -a artist -d 'Search for an artist'
complete -c spoti -n __spoti_needs_command -a playlists -d 'List your playlists'
complete -c spoti -n __spoti_needs_command -a playlist -d 'Show a playlist'
complete -c spoti -n __spoti_needs_command -a liked -d 'List liked tracks'
complete -c spoti -n __spoti_needs_command -a like -d 'Like the current track'
complete -c spoti -n __spoti_needs_command -a unlike -d 'Unlike the current track'
complete -c spoti -n __spoti_needs_command -a recent -d 'Show recently played tracks'
complete -c spoti -n __spoti_needs_command -a update -d 'Check for or install updates'
complete -c spoti -n __spoti_needs_command -a search -d 'Search Spotify tracks'
complete -c spoti -n __spoti_needs_command -a play -d 'Play a track, album, artist, or playlist'
complete -c spoti -n __spoti_needs_command -a completion -d 'Print a shell completion script'
complete -c spoti -n __spoti_needs_command -a 'i p pa r np q s vol dev devs pl pls rep rec n prev' -d 'Command alias'

complete -c spoti -n '__fish_seen_subcommand_from config; and not __fish_seen_subcommand_from get set reset path unset' -a 'get set reset path unset'
complete -c spoti -n '__fish_seen_subcommand_from config; and __fish_seen_subcommand_from get set unset' -a 'spotifyClientId watchAfterPlay refreshIntervalMs'
complete -c spoti -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish'
complete -c spoti -n '__fish_seen_subcommand_from now np' -s w -l watch -d 'Continuously refresh playback information'
complete -c spoti -n '__fish_seen_subcommand_from queue q album artist playlist pl' -l first -d 'Select the first result without prompting'
complete -c spoti -n '__fish_seen_subcommand_from playlists pls liked recent rec search s' -s l -l limit -r -d 'Maximum number of results'
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
