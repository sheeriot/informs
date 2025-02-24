workspace "Intaker" "A Django (python) web application for form data collection and curation " {

    !identifiers hierarchical
    # !docs readme

    model {

        groundops = element "GroundOps" "" "" groundopstag {
            # intaker -> groundops
        }

        email_service = softwareSystem "Email" "Azure Communications Service" emailservice_tag {
            -> groundops "email" "" email2groundopstag
        }
        takserver = softwareSystem "TAK Server" "Team Awareness Kit" takservertag {
            events = container "events"
            -> groundops ATAK "" send2ataktag
        }

        azure_maps = softwareSystem "Azure Maps" "" azuremapstag

        informs = softwareSystem "InForms" "Web App" informstag {
            forms = container "Aid Requests" "" "intake forms" intakeformstag {
                groundops -> this "updates" "" groundops2forms
            }
            db = container "Informs Database" "" "" informsdbtag
            curate = container "Curation" "" "Business Logic" informscuratetag {
            }
            dispatch = container "Dispatch" "" "" informsdispatchtag {
            }
            tasks = container "Tasks" "" "" informstaskstag {
                dispatch -> this notify (email/sms)
                dispatch -> this alert (TAK)
                this -> email_service SMTP
                this -> azure_maps geocode "save map"
                curate -> this mapit
            }
            pytak = container "PyTAK" "" "" informspytaktag {
                -> takserver "COT" "" pytak2takservertag
                tasks -> this "SendCOT"
            }
        }

        dispatchops = element "DispatchOps" "" "" dispatchopstag {
            -> informs.forms "admin" "" dispatch2intakeformstag
            -> informs.curate "curate" "" dispatch2intakecuratetag
            -> informs.dispatch "dispatch" "" dispatch2intakedispatchtag
        }
    }
    views {

        systemContext informs "InFormsCustomApp" {
            include *
            include groundops
        }

        # container <software system identifier> [key] [description] {
        #     ...
        # }
        container informs informsview "InForms - Custom Web App" {
            include *
            include groundops
            include dispatchops
            # autolayout lr
        }

        styles {
            relationship "Relationship" {
                # color green
                dashed false
                fontSize 36
                thickness 3
            }

            element azuremapstag {
                shape ellipse
                background lightblue
                color black
                fontSize 18
                icon icons/map_icon.png
                height 200
                width 300
            }
            element takservertag {
                shape ellipse
                background #e79ea6
                color black
                fontSize 18
                icon icons/tak_gov.png
                height 200
                width 300
            }
            element emailservice_tag {
                shape ellipse
                background #87CEFA
                color black
                fontSize 18
                icon icons/email_icon.png
                height 200
                width 300
            }
            element dispatchopstag {
                shape person
                background #8FBC8F
                icon icons/mic-fill-red.png
                height 200
                width 300
            }
            element groundopstag {
                shape person
                background #DAA520
                icon icons/life-preserver_red.png
                height 200
                width 300
            }
            element informstag {
                background #0a1856
                # background blue
                color white
                shape RoundedBox
                icon icons/informs_icon.png
            }
            element intakeformstag {
                background #0a1856
                color white
                shape Pipe
                icon icons/informs_icon.png
                width 300
                height 200
            }
            element informsdbtag {
                background lightgreen
                color black
                shape Cylinder
                width 200
                height 133
                fontSize 14
            }
            element informscuratetag {
                background yellow
                color black
                shape hexagon
                width 300
            }
            element informsdispatchtag {
                background lightcoral
                color black
                shape roundedbox
                height 200
                width 300
            }
            element informstaskstag {
                background #b0c4de
                color black
                shape pipe
                height 200
                width 300
            }
            element informspytaktag {
                background #D491AD
                color black
                shape component
                height 100
                width 150
                fontSize 14
            }
        }
    }
}
