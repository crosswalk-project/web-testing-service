#!/bin/bash

TIME_STAMP=$(date +%Y-%m-%d-%H-%M-%S)
SERVICE_DIR=$(cd `dirname $0`; pwd)
SERVICE_LOG_DIR="$SERVICE_DIR/log/"
SERVICE_LOG_FILE="$SERVICE_LOG_DIR/$TIME_STAMP.log"

service_msg(){
    echo "* $*"
}

mkdir -p $SERVICE_LOG_DIR
if [ $? -ne 0 ]; then
        service_msg "Fail to create service log folder"
        exit 1
fi

PYTHON_VERSION=`python -V 2>&1`
MAIN_VERSION=`echo $PYTHON_VERSION | cut -c 8-11`
if [ "${MAIN_VERSION}" != "2.7." ]; then
        service_msg "Wrong Python version, WTS need Python 2.7+(but not Python 3.x)"
        exit 1
fi

check_service(){
        service_process=`ps -ef|grep 'wts-serve.py'|grep -v grep|awk '{print $2}'`
        if [ -z "$service_process" ]; then
                return 1
        fi
        return 0
}

kill_service(){
        kill -9 `ps -ef|grep 'wts-serve.py'|grep -v grep|awk '{print $2}'`
        return 0
}

start_service(){
        cd $SERVICE_DIR
        python wts-serve.py 2> $SERVICE_LOG_FILE &
        cd - 1> /dev/null 2>&1
        sleep 1
        check_service
        if [ $? -ne 0 ]; then
                service_msg "Fail to start service"
                return 1
        fi
        return 0
}

stop_service(){
        check_service
        if [ $? -eq 0 ]; then
                kill_service
                sleep 1
                check_service
                if [ $? -eq 0 ]; then
                        service_msg "Fail to stop service"
                        return 1
                fi
        fi
        return 0
}

update_service(){
        cd $SERVICE_DIR
        git pull
        if [ $? -ne 0 ]; then
                service_msg "Fail to update service source code"
                return 1
        fi
        cd - 1> /dev/null 2>&1
        sync
        return 0
}

case $1 in
        stop)
                service_msg "Stoping service ..."
                stop_service
                if [ $? -ne 0 ]; then
                        exit 1
                fi
        ;;
        start | restart)
                service_msg "Stoping service ..."
                stop_service
                if [ $? -ne 0 ]; then
                        exit 1
                fi
                service_msg "Starting service ..."
                start_service
                if [ $? -ne 0 ]; then
                        exit 1
                fi
        ;;
        upgrade)
                service_msg "Stoping service ..."
                stop_service
                if [ $? -ne 0 ]; then
                        exit 1
                fi
                service_msg "Updating service ..."
                update_service
                if [ $? -ne 0 ]; then
                        exit 1
                fi
                service_msg "Starting service ..."
                start_service
                if [ $? -ne 0 ]; then
                        exit 1
                fi
        ;;
        *)
                service_msg "Usage: wts.sh {start|restart|stop|upgrade}"
                exit 1
        ;;
esac
