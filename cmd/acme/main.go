// Command acme serves the embedded React application and its Go API.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gibbandit/acmekit/internal/server"
	"github.com/gibbandit/acmekit/web"
)

var version = "0.1.0"

func main() {
	if err := run(os.Args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return
		}
		slog.Error("Acme stopped", "error", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	flags := flag.NewFlagSet("acme", flag.ContinueOnError)
	addr := flags.String("addr", envOr("ACME_ADDR", "127.0.0.1:8080"), "HTTP listen address")
	demo := flags.Bool("demo", false, "enable sample sign-in on a loopback listener")
	showVersion := flags.Bool("version", false, "print the application version")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected arguments; use --help for available options")
	}
	if *showVersion {
		fmt.Println("Acme " + version)
		return nil
	}
	if err := validateAddress(*addr, *demo); err != nil {
		return err
	}
	publicURL := envOr("ACME_PUBLIC_URL", "http://"+*addr)
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	handler, err := server.New(server.Config{
		DemoMode:           *demo,
		PublicURL:          publicURL,
		GitHubClientID:     strings.TrimSpace(os.Getenv("ACME_GITHUB_CLIENT_ID")),
		GitHubClientSecret: strings.TrimSpace(os.Getenv("ACME_GITHUB_CLIENT_SECRET")),
		Operations:         web.Operations,
		Version:            version,
		Logger:             logger,
	}, web.FS)
	if err != nil {
		return err
	}
	httpServer := &http.Server{
		Addr: *addr, Handler: handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	shutdownDone := make(chan struct{})
	go func() {
		defer close(shutdownDone)
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			logger.Error("graceful shutdown failed", "error", err)
			_ = httpServer.Close()
		}
	}()
	logger.Info("starting Acme", "address", *addr, "demo", *demo, "storage", "memory", "version", version)
	err = httpServer.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		<-shutdownDone
		return nil
	}
	stop()
	<-shutdownDone
	return err
}

func envOr(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func validateAddress(address string, demo bool) error {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return fmt.Errorf("invalid listen address: %w", err)
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 0 || portNumber > 65535 {
		return errors.New("listen address must contain a port between 0 and 65535")
	}
	if demo {
		ip := net.ParseIP(host)
		if host != "localhost" && (ip == nil || !ip.IsLoopback()) {
			return errors.New("--demo is restricted to localhost or a loopback IP; use --addr 127.0.0.1:8080")
		}
	}
	return nil
}
