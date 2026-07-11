{
  description = "Garage UI - Web Dashboard for Garage S3 Storage";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f system);
    in
    {
      packages = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          lib = pkgs.lib;
          version = "0.1.0";

          # Build the React/Vite frontend
          frontend = pkgs.buildNpmPackage {
            pname = "garage-ui-frontend";
            inherit version;
            src = ./frontend;
            npmDepsHash = "sha256-qx7DRfjCDhtamf9NcKda4PtGsN+qNKUcTQZwZRiVMts=";
            installPhase = ''
              runHook preInstall
              mkdir -p $out
              cp -r dist/. $out/
              runHook postInstall
            '';
          };

          # Build the Go backend
          backend = pkgs.buildGoModule {
            pname = "garage-ui-backend";
            inherit version;
            src = ./backend;
            vendorHash = "sha256-w1ESuQkFw10X3v/L4iHq6DwxCc9Wbu6h/ujzJqHOipM=";
            nativeBuildInputs = [ pkgs.go-swag ];
            # swag init generates docs/docs.go which is required for compilation
            preBuild = ''
              swag init
            '';
            ldflags = [
              "-s" "-w"
              "-X main.version=${version}"
            ];
          };

          # Combined package: binary + frontend dist in the correct layout.
          # The binary hardcodes "./frontend/dist" as the static files path,
          # so the wrapper sets the working directory accordingly.
          garage-ui = pkgs.runCommand "garage-ui-${version}" {
            nativeBuildInputs = [ pkgs.makeWrapper ];
          } ''
            mkdir -p $out/bin $out/share/garage-ui/frontend
            cp ${backend}/bin/garage-ui $out/share/garage-ui/garage-ui-bin
            cp -r ${frontend}/. $out/share/garage-ui/frontend/dist
            makeWrapper $out/share/garage-ui/garage-ui-bin $out/bin/garage-ui \
              --chdir $out/share/garage-ui
          '';
        in
        {
          default = garage-ui;
          inherit garage-ui frontend backend;
        });

      nixosModules.default = { config, lib, pkgs, ... }:
        let
          cfg = config.services.garage-ui;
          pkg = self.packages.${pkgs.stdenv.hostPlatform.system}.garage-ui;
        in
        {
          options.services.garage-ui = {
            enable = lib.mkEnableOption "Garage UI web dashboard for Garage S3 storage";

            package = lib.mkOption {
              type = lib.types.package;
              default = pkg;
              description = "The garage-ui package to use.";
            };

            configFile = lib.mkOption {
              type = lib.types.path;
              description = "Path to the garage-ui config.yaml file.";
              example = "/etc/garage-ui/config.yaml";
            };

            garageTomlFile = lib.mkOption {
              type = lib.types.nullOr lib.types.path;
              default = null;
              description = "Optional path to garage.toml to extract Garage connection details.";
              example = "/etc/garage/garage.toml";
            };

            user = lib.mkOption {
              type = lib.types.str;
              default = "garage-ui";
              description = "User account under which garage-ui runs.";
            };

            group = lib.mkOption {
              type = lib.types.str;
              default = "garage-ui";
              description = "Group under which garage-ui runs.";
            };
          };

          config = lib.mkIf cfg.enable {
            users.users.${cfg.user} = {
              isSystemUser = true;
              group = cfg.group;
              description = "garage-ui service user";
            };
            users.groups.${cfg.group} = { };

            systemd.services.garage-ui = {
              description = "Garage UI web dashboard";
              wantedBy = [ "multi-user.target" ];
              after = [ "network.target" ];
              serviceConfig = {
                User = cfg.user;
                Group = cfg.group;
                ExecStart = lib.concatStringsSep " " (
                  [ "${cfg.package}/bin/garage-ui" "--config ${cfg.configFile}" ]
                  ++ lib.optionals (cfg.garageTomlFile != null)
                    [ "--garage-toml ${cfg.garageTomlFile}" ]
                );
                Restart = "on-failure";
                RestartSec = "5s";
                # Basic hardening
                NoNewPrivileges = true;
                PrivateTmp = true;
                ProtectSystem = "strict";
                ProtectHome = true;
              };
            };
          };
        };
    };
}
